import asyncio
from datetime import datetime

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from .. import state
from ..floor_control import FloorController
from ..models import Language, Meeting, MeetingCreate, MeetingStatus, Report
from ..realtime import manager
from ..services import llm
from ..store import store

router = APIRouter(prefix="/api/meetings", tags=["meetings"])
_report_tasks: set[asyncio.Task] = set()


def _get(meeting_id: str) -> Meeting:
    meeting = store.get(meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    return meeting


@router.get("")
def list_meetings() -> list[Meeting]:
    return sorted(store.meetings.values(), key=lambda m: m.started_at or datetime.min, reverse=True)


@router.post("")
def create_meeting(body: MeetingCreate) -> Meeting:
    if not body.title.strip():
        raise HTTPException(422, "Title is required")
    if not any(p.name.strip() for p in body.participants):
        raise HTTPException(422, "Add at least one participant")
    devices = [p.device_id for p in body.participants if p.device_id]
    if len(devices) != len(set(devices)):
        raise HTTPException(422, "Each button can belong to one participant only")
    return store.add(Meeting(**body.model_dump()))


@router.get("/{meeting_id}")
def get_meeting(meeting_id: str) -> Meeting:
    return _get(meeting_id)


@router.delete("/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: str) -> None:
    if _get(meeting_id).status == MeetingStatus.live:
        raise HTTPException(409, "End the meeting before deleting it")
    store.delete(meeting_id)


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
    state.floor = FloorController(mode=meeting.floor_mode)
    await manager.set_leds({"*": "ready"})
    await manager.broadcast({"type": "meeting_started", "meeting_id": meeting.id})
    return meeting


@router.post("/{meeting_id}/end")
async def end_meeting(meeting_id: str, language: Language | None = None) -> Meeting:
    """Ends the meeting right away; the minutes are generated in the background (report_ready event)."""
    meeting = _get(meeting_id)
    if meeting.status != MeetingStatus.live:
        raise HTTPException(409, "This meeting is not live")
    meeting.status = MeetingStatus.ended
    meeting.ended_at = datetime.now()
    if store.active_meeting_id == meeting.id:
        store.active_meeting_id = None
    state.floor = FloorController()
    await manager.set_leds({"*": "muted"})
    _generate_in_background(meeting, language)
    await manager.broadcast({"type": "meeting_ended", "meeting_id": meeting.id})
    return meeting


@router.post("/{meeting_id}/report/generate")
def regenerate_report(meeting_id: str, language: Language | None = None) -> Meeting:
    """Writes the minutes again, e.g. after the AI server was unreachable."""
    meeting = _get(meeting_id)
    if meeting.status != MeetingStatus.ended:
        raise HTTPException(409, "The meeting has not ended yet")
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
