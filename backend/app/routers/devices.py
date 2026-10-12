"""Speaker buttons (real hardware or the browser simulator) connect here.

Protocol: docs/device-protocol.md
"""

import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import state
from ..models import Utterance
from ..realtime import manager
from ..services import stt
from ..store import store

router = APIRouter(tags=["devices"])


@router.get("/api/devices")
def list_devices() -> list[str]:
    return sorted(manager.devices)


@router.websocket("/ws/device/{device_id}")
async def device_ws(ws: WebSocket, device_id: str) -> None:
    await ws.accept()
    manager.devices[device_id] = ws
    await manager.broadcast({"type": "device_connected", "device_id": device_id})
    await ws.send_json({"type": "led", "state": "ready" if store.active else "muted"})

    audio = bytearray()
    turn_started: datetime | None = None

    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                if state.floor.is_talking(device_id):
                    # turn may start on button_down or when the queue hands us the floor
                    turn_started = turn_started or datetime.now()
                    audio.extend(msg["bytes"])
                continue

            event = json.loads(msg["text"])
            kind = event.get("type")

            if kind == "button_down" and store.active:
                changes = state.floor.request(device_id)
                if changes.get(device_id) == "talking":
                    audio.clear()
                    turn_started = datetime.now()
                await manager.set_leds(changes)

            elif kind == "button_up":
                was_talking = state.floor.is_talking(device_id)
                await manager.set_leds(state.floor.release(device_id))
                if was_talking and audio and turn_started:
                    await _finish_turn(device_id, bytes(audio), turn_started)
                audio.clear()
                turn_started = None

            elif kind in ("hello", "battery"):
                level = event.get("battery", event.get("level"))
                await manager.broadcast({"type": "battery", "device_id": device_id, "level": level})
    except WebSocketDisconnect:
        pass
    finally:
        manager.devices.pop(device_id, None)
        await manager.set_leds(state.floor.release(device_id))
        await manager.broadcast({"type": "device_disconnected", "device_id": device_id})


async def _finish_turn(device_id: str, pcm: bytes, started: datetime) -> None:
    meeting = store.active
    participant = store.participant_for_device(device_id)
    if not meeting or not participant:
        return
    # Whisper is CPU/GPU bound — run it off the event loop
    text, lang = await asyncio.to_thread(stt.transcribe, pcm, None)
    if not text.strip():
        return
    utterance = Utterance(
        participant_id=participant.id, started_at=started, ended_at=datetime.now(), text=text, language=lang
    )
    meeting.utterances.append(utterance)
    await manager.broadcast({"type": "utterance", "utterance": utterance.model_dump(mode="json")})
