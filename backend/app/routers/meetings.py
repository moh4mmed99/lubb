import asyncio
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from .. import state
from ..floor_control import FloorController
from ..models import (
    AgendaMove,
    FloorMode,
    FloorMove,
    FollowUp,
    FollowUpRef,
    FollowUpStatus,
    Language,
    ManualMinutes,
    Meeting,
    MeetingCreate,
    MeetingStatus,
    Report,
    Task,
)
from ..realtime import manager
from ..services import export, llm, recordings
from ..store import store
from .devices import apply_floor, finish_turn

router = APIRouter(prefix="/api/meetings", tags=["meetings"])
_report_tasks: set[asyncio.Task] = set()


def _get(meeting_id: str) -> Meeting:
    meeting = store.get(meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    return meeting


def _source_task(ref: FollowUpRef) -> tuple[Meeting, Task] | None:
    """The earlier meeting and the task in its minutes that a follow-up points to, if both are still there."""
    source = store.get(ref.meeting_id)
    task = next((t for t in source.report.tasks if t.id == ref.task_id), None) if source and source.report else None
    return (source, task) if task else None


def _follow_up(source: Meeting, task: Task) -> FollowUp:
    owner = next((p.name for p in source.participants if p.id == task.owner_id), None)
    return FollowUp(
        meeting_id=source.id,
        task_id=task.id,
        text=task.text,
        owner=owner,
        due_date=task.due_date,
        meeting_title=source.title,
        done=task.done,
    )


def _sync_followups(meeting: Meeting) -> Meeting:
    """Until it ends, a meeting's follow-ups match the original tasks (they may be edited or ticked elsewhere).
    A task whose meeting was deleted keeps the copy."""
    if meeting.status != MeetingStatus.ended:
        meeting.followups = [_follow_up(*found) if (found := _source_task(f)) else f for f in meeting.followups]
    return meeting


@router.get("")
def list_meetings() -> list[Meeting]:
    meetings = sorted(store.meetings.values(), key=lambda m: m.started_at or datetime.min, reverse=True)
    return [_sync_followups(m) for m in meetings]


@router.post("")
def create_meeting(body: MeetingCreate) -> Meeting:
    if not body.title.strip():
        raise HTTPException(422, "Title is required")
    if not any(p.name.strip() for p in body.participants):
        raise HTTPException(422, "Add at least one participant")
    devices = [p.device_id for p in body.participants if p.device_id]
    if len(devices) != len(set(devices)):
        raise HTTPException(422, "Each button can belong to one participant only")
    followups = []
    for ref in {(r.meeting_id, r.task_id): r for r in body.followups}.values():  # each task once
        found = _source_task(ref)
        if not found:
            raise HTTPException(422, "A task to follow up no longer exists")
        followups.append(_follow_up(*found))
    return store.add(Meeting(**body.model_dump(exclude={"followups"}), followups=followups))


@router.post("/manual")
def create_manual_minutes(body: ManualMinutes) -> Meeting:
    """Records a meeting held without LUBB as already ended, with empty minutes to fill in by hand."""
    if not body.title.strip():
        raise HTTPException(422, "Title is required")
    if body.ended_at < body.started_at:
        raise HTTPException(422, "The meeting can't end before it starts")
    meeting = Meeting(
        **body.model_dump(exclude={"participants", "agenda"}),
        agenda=[a.strip() for a in body.agenda if a.strip()],
        participants=[p for p in body.participants if p.name.strip()],
        agenda_index=len([a for a in body.agenda if a.strip()]),  # nothing left to discuss
        status=MeetingStatus.ended,
        manual=True,
        report=Report(language=body.language),
    )
    return store.add(meeting)


@router.delete("", status_code=200)
def delete_history() -> dict:
    """Clears the archive. The live meeting, if any, is kept."""
    gone = [m.id for m in list(store.meetings.values()) if m.status != MeetingStatus.live]
    for meeting_id in gone:
        store.delete(meeting_id)
        recordings.delete(meeting_id)
    return {"deleted": len(gone)}


@router.get("/{meeting_id}")
def get_meeting(meeting_id: str) -> Meeting:
    return _sync_followups(_get(meeting_id))


@router.delete("/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: str) -> None:
    if _get(meeting_id).status == MeetingStatus.live:
        raise HTTPException(409, "End the meeting before deleting it")
    store.delete(meeting_id)
    recordings.delete(meeting_id)


@router.get("/{meeting_id}/audio")
def get_recording(meeting_id: str) -> FileResponse:
    """The meeting's recording: every turn in speaking order, as one WAV file."""
    meeting = _get(meeting_id)
    path = recordings.meeting_audio(meeting)
    if not path:
        raise HTTPException(404, "This meeting has no recording")
    return FileResponse(path, media_type="audio/wav", filename=f"{meeting.title}.wav", content_disposition_type="inline")


@router.post("/{meeting_id}/start")
async def start_meeting(meeting_id: str) -> Meeting:
    meeting = _get(meeting_id)
    if store.active and store.active.id != meeting.id:
        raise HTTPException(409, f"Another meeting is live: {store.active.title}")
    if meeting.status == MeetingStatus.ended:
        raise HTTPException(409, "This meeting has already ended")
    meeting.status = MeetingStatus.live
    meeting.started_at = meeting.started_at or datetime.now()
    store.active_meeting_id = meeting.id
    store.save(meeting)
    state.floor = state.floor_for(meeting)
    await manager.set_leds({"*": "ready"})
    await manager.broadcast({"type": "meeting_started", "meeting_id": meeting.id})
    return meeting


@router.post("/{meeting_id}/end")
async def end_meeting(meeting_id: str, language: Language | None = None) -> Meeting:
    """Ends the meeting right away; the minutes are generated in the background (report_ready event)."""
    meeting = _get(meeting_id)
    if meeting.status != MeetingStatus.live:
        raise HTTPException(409, "This meeting is not live")
    _sync_followups(meeting)  # as they stand now; the minutes keep them so
    meeting.status = MeetingStatus.ended
    meeting.ended_at = datetime.now()
    meeting.now_showing = None
    if store.active_meeting_id == meeting.id:
        store.active_meeting_id = None
    state.floor = FloorController()
    await manager.set_leds({"*": "muted"})
    _generate_in_background(meeting, language)
    await manager.broadcast({"type": "meeting_ended", "meeting_id": meeting.id})
    return meeting


def _live_chairman(meeting_id: str) -> Meeting:
    meeting = _get(meeting_id)
    if meeting.status != MeetingStatus.live or store.active_meeting_id != meeting.id:
        raise HTTPException(409, "This meeting is not live")
    if meeting.floor_mode != FloorMode.chairman:
        raise HTTPException(409, "The chair controls the floor only in chairman mode")
    return meeting


@router.get("/{meeting_id}/floor")
def get_floor(meeting_id: str) -> dict:
    """Who has the floor and who is waiting, in order (for the chair's panel)."""
    _get(meeting_id)
    live = store.active_meeting_id == meeting_id
    return {"talking": list(state.floor.talking) if live else [], "queue": list(state.floor.queue) if live else []}


@router.post("/{meeting_id}/floor/grant")
async def grant_floor(meeting_id: str, body: FloorMove) -> dict:
    """Chair gives the floor to a button (usually the next in the queue)."""
    _live_chairman(meeting_id)
    for d in state.floor.talking:
        if d != body.device_id:
            finish_turn(d)  # keep what the previous speaker said
    await apply_floor(state.floor.grant(body.device_id))
    return get_floor(meeting_id)


@router.post("/{meeting_id}/floor/revoke")
async def revoke_floor(meeting_id: str) -> dict:
    """Chair takes the floor back."""
    _live_chairman(meeting_id)
    for d in state.floor.talking:
        finish_turn(d)
    await apply_floor(state.floor.revoke())
    return get_floor(meeting_id)


@router.post("/{meeting_id}/floor/dismiss")
async def dismiss_request(meeting_id: str, body: FloorMove) -> dict:
    """Chair removes a raised hand from the queue."""
    _live_chairman(meeting_id)
    if body.device_id in state.floor.queue:
        await apply_floor(state.floor.drop(body.device_id))
    return get_floor(meeting_id)


@router.post("/{meeting_id}/agenda")
async def move_agenda(meeting_id: str, body: AgendaMove) -> Meeting:
    """Chair moves the live meeting to another agenda item (len(agenda) = all items done)."""
    meeting = _get(meeting_id)
    if meeting.status != MeetingStatus.live:
        raise HTTPException(409, "This meeting is not live")
    meeting.agenda_index = max(0, min(body.index, len(meeting.agenda)))
    store.save(meeting)
    await manager.broadcast({"type": "agenda", "meeting_id": meeting.id, "index": meeting.agenda_index})
    return meeting


@router.put("/{meeting_id}/followups/{task_id}")
async def set_followup(meeting_id: str, task_id: str, body: FollowUpStatus) -> FollowUp:
    """Ticks a followed-up task done (or open again) in the meeting; the task in the earlier minutes changes too."""
    meeting = _get(meeting_id)
    followup = next((f for f in meeting.followups if f.task_id == task_id), None)
    if not followup:
        raise HTTPException(404, "This meeting doesn't follow up that task")
    if meeting.status == MeetingStatus.ended:
        raise HTTPException(409, "This meeting has ended; tick the task on the task follow-up page")
    if found := _source_task(followup):
        source, task = found
        task.done = body.done
        store.save(source)
    followup.done = body.done
    store.save(meeting)
    await manager.broadcast({"type": "followup", "meeting_id": meeting.id, "task_id": task_id, "done": body.done})
    return followup


@router.post("/{meeting_id}/report/generate")
def regenerate_report(meeting_id: str, language: Language | None = None) -> Meeting:
    """Writes the minutes again, e.g. after the AI server was unreachable."""
    meeting = _get(meeting_id)
    if meeting.status != MeetingStatus.ended:
        raise HTTPException(409, "The meeting has not ended yet")
    if meeting.manual:  # nothing was recorded, so the AI would overwrite them with empty minutes
        raise HTTPException(409, "These minutes were written by hand; there is no recording to summarise")
    if not meeting.report_pending:
        _generate_in_background(meeting, language)
    return meeting


def _generate_in_background(meeting: Meeting, language: Language | None) -> None:
    meeting.report_pending = True
    store.save(meeting)

    async def run() -> None:
        try:
            # Turns still being transcribed belong in the minutes
            if state.pending_turns:
                await asyncio.gather(*state.pending_turns, return_exceptions=True)
            meeting.report = await llm.generate_report(meeting, (language or meeting.language).value)
        finally:
            meeting.report_pending = False
            store.save(meeting)
        await manager.broadcast({"type": "report_ready", "meeting_id": meeting.id})

    task = asyncio.create_task(run())
    _report_tasks.add(task)
    task.add_done_callback(_report_tasks.discard)


@router.get("/{meeting_id}/export/docx")
def export_docx(meeting_id: str) -> Response:
    """The minutes as a Word document (letterhead from ORG_NAME)."""
    meeting = _get(meeting_id)
    filename = f"{meeting.title} - {meeting.started_at:%Y-%m-%d}.docx" if meeting.started_at else f"{meeting.title}.docx"
    return Response(
        export.minutes_docx(meeting),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        # filename* carries Arabic titles intact; the plain one is an ASCII fallback
        headers={"Content-Disposition": f"attachment; filename=minutes.docx; filename*=UTF-8''{quote(filename)}"},
    )


@router.put("/{meeting_id}/report")
def update_report(meeting_id: str, report: Report) -> Report:
    """Secretary edits / approves the AI-generated minutes."""
    meeting = _get(meeting_id)
    meeting.report = report
    store.save(meeting)
    return report


@router.websocket("/ws")
async def dashboard_ws(ws: WebSocket) -> None:
    """Dashboards subscribe here for live events (utterances, speaker state, meeting lifecycle)."""
    await ws.accept()
    manager.dashboards.add(ws)
    try:
        while True:
            await ws.receive_text()  # keep-alive; dashboards don't send commands yet
    except WebSocketDisconnect:
        manager.dashboards.discard(ws)
