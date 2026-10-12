from datetime import datetime

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from .. import state
from ..floor_control import FloorController
from ..models import Language, Meeting, MeetingCreate, MeetingStatus, Report
from ..realtime import manager
from ..services import llm
from ..store import store

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


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
    return store.add(Meeting(**body.model_dump()))


@router.get("/{meeting_id}")
def get_meeting(meeting_id: str) -> Meeting:
    return _get(meeting_id)


@router.post("/{meeting_id}/start")
async def start_meeting(meeting_id: str) -> Meeting:
    meeting = _get(meeting_id)
    meeting.status = MeetingStatus.live
    meeting.started_at = datetime.now()
    store.active_meeting_id = meeting.id
    state.floor = FloorController(mode=meeting.floor_mode)
    await manager.set_leds({"*": "ready"})
    await manager.broadcast({"type": "meeting_started", "meeting_id": meeting.id})
    return meeting


@router.post("/{meeting_id}/end")
async def end_meeting(meeting_id: str, language: Language | None = None) -> Meeting:
    meeting = _get(meeting_id)
    meeting.status = MeetingStatus.ended
    meeting.ended_at = datetime.now()
    if store.active_meeting_id == meeting.id:
        store.active_meeting_id = None
    await manager.set_leds({"*": "muted"})
    meeting.report = await llm.generate_report(meeting, (language or meeting.language).value)
    await manager.broadcast({"type": "meeting_ended", "meeting_id": meeting.id})
    return meeting


@router.put("/{meeting_id}/report")
def update_report(meeting_id: str, report: Report) -> Report:
    """Secretary edits / approves the AI-generated minutes."""
    meeting = _get(meeting_id)
    meeting.report = report
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
