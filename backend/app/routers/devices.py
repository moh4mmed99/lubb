"""Speaker buttons connect here.

Protocol: docs/device-protocol.md
"""

import asyncio
import bisect
import json
import logging
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import state
from ..config import settings
from ..models import FloorMode, Meeting, SlideRef, Utterance
from ..realtime import manager
from ..services import recordings, stt
from ..store import store

router = APIRouter(tags=["devices"])
REPLACED = 4001  # WebSocket close code: another connection took over this device_id
log = logging.getLogger(__name__)


@router.get("/api/devices")
def list_devices() -> list[dict]:
    """Connected buttons with their LED state and battery level."""
    return manager.snapshot()


# Audio of the turn in progress, per device. Shared so the chair's panel can close a turn
# (when it gives the floor to someone else) as well as the button itself.
_turns: dict[str, tuple[bytearray, datetime]] = {}


def finish_turn(device_id: str) -> None:
    """Close the device's turn in progress, if any, and transcribe it."""
    audio, started = _turns.pop(device_id, (None, None))
    if audio:
        _start_turn_task(device_id, bytes(audio), started)


async def apply_floor(changes: dict[str, str]) -> None:
    """Push floor changes to the buttons' LEDs and tell dashboards the new speaker/queue."""
    await manager.set_leds(changes)
    if changes and store.active:
        await manager.broadcast(
            {
                "type": "floor",
                "meeting_id": store.active.id,
                "talking": list(state.floor.talking),
                "queue": list(state.floor.queue),
            }
        )


def _initial_led() -> str:
    if not settings.mics_enabled or not store.active:
        return "muted"
    if state.floor.mode == FloorMode.one_at_a_time and state.floor.talking:
        return "muted"
    return "ready"


@router.websocket("/ws/device/{device_id}")
async def device_ws(ws: WebSocket, device_id: str) -> None:
    await ws.accept()
    if old := manager.devices.get(device_id):  # same button reconnecting: drop the stale socket
        try:
            # A distinct close code tells the replaced connection not to reconnect and fight over the button
            await old.close(code=REPLACED, reason="replaced")
        except Exception:
            pass
        manager.devices.pop(device_id, None)
    # A fresh connection is never mid-turn: drop any floor the old socket still held,
    # or the button would stay "talking" (and everyone else muted) forever.
    if state.floor.is_talking(device_id) or device_id in state.floor.queue:
        finish_turn(device_id)
        await apply_floor(state.floor.drop(device_id))
    manager.devices[device_id] = ws
    manager.leds[device_id] = _initial_led()
    await manager.broadcast({"type": "device_connected", "device_id": device_id})
    await ws.send_json({"type": "led", "state": manager.leds[device_id]})
    await manager.broadcast({"type": "speaker_state", "device_id": device_id, "state": manager.leds[device_id]})

    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                if settings.mics_enabled and state.floor.is_talking(device_id):
                    # turn may start on button_down or when the queue / chair hands us the floor
                    _turns.setdefault(device_id, (bytearray(), datetime.now()))[0].extend(msg["bytes"])
                continue

            event = json.loads(msg["text"])
            kind = event.get("type")

            if kind == "button_down" and store.active and settings.mics_enabled:
                changes = state.floor.request(device_id)
                if changes.get(device_id) == "talking" or state.floor.is_talking(device_id):
                    _turns[device_id] = (bytearray(), datetime.now())  # a new utterance starts
                await apply_floor(changes)

            elif kind == "button_up":
                # Audio only accumulates while the device had the floor, so whatever is buffered was
                # spoken legitimately, even if the chair took the floor back mid-sentence.
                finish_turn(device_id)
                await apply_floor(state.floor.release(device_id))

            elif kind in ("hello", "battery"):
                level = event.get("battery", event.get("level"))
                manager.battery[device_id] = level
                await manager.broadcast({"type": "battery", "device_id": device_id, "level": level})
    except WebSocketDisconnect:
        pass
    finally:
        if manager.devices.get(device_id) is ws:  # not replaced by a newer connection
            finish_turn(device_id)  # keep what was said before the drop
            manager.devices.pop(device_id, None)
            manager.leds.pop(device_id, None)
            manager.battery.pop(device_id, None)
            await apply_floor(state.floor.drop(device_id))
            await manager.broadcast({"type": "device_disconnected", "device_id": device_id})


def _start_turn_task(device_id: str, pcm: bytes, started: datetime) -> None:
    """Transcribes in the background so the button stays responsive; ending a meeting waits for these."""
    meeting = store.active
    participant = store.participant_for_device(device_id)
    if not meeting or not participant:
        return
    # Tag the turn with the item under discussion now, not when transcription finishes
    item = meeting.agenda_index if meeting.agenda_index < len(meeting.agenda) else None
    task = asyncio.create_task(
        _finish_turn(meeting, participant.id, device_id, pcm, started, datetime.now(), item, meeting.now_showing)
    )
    state.pending_turns.add(task)
    task.add_done_callback(state.pending_turns.discard)


async def _finish_turn(
    meeting: Meeting,
    participant_id: str,
    device_id: str,
    pcm: bytes,
    started: datetime,
    ended: datetime,
    agenda_index: int | None = None,
    slide: SlideRef | None = None,
) -> None:
    # Whisper is CPU/GPU bound (or a network call when remote) — run it off the event loop
    try:
        text, lang = await asyncio.to_thread(stt.transcribe, pcm, meeting.language.value)
    except Exception as exc:  # remote server down, tunnel expired, model error…
        log.exception("Transcription failed for %s", device_id)
        await manager.broadcast({"type": "error", "source": "stt", "message": str(exc)})
        return
    if not text.strip():
        return
    utterance = Utterance(
        participant_id=participant_id,
        started_at=started,
        ended_at=ended,
        text=text,
        language=lang,
        agenda_index=agenda_index,
        slide=slide,
    )
    if settings.record_audio:
        try:
            await asyncio.to_thread(recordings.save_turn, meeting.id, utterance.id, pcm)
            utterance.audio = True
        except OSError:  # disk full… the text is what matters most, so keep it anyway
            log.exception("Could not save the recording of a turn")
    # Turns can finish transcribing out of order; keep the transcript in speaking order.
    bisect.insort(meeting.utterances, utterance, key=lambda u: u.started_at)
    store.save(meeting)
    await manager.broadcast(
        {"type": "utterance", "meeting_id": meeting.id, "utterance": utterance.model_dump(mode="json")}
    )
