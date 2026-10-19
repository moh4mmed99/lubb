"""Runtime state for the live meeting."""

import asyncio

from .floor_control import FloorController
from .models import Meeting
from .store import store


def floor_for(meeting: Meeting) -> FloorController:
    """Speaking rules for a meeting; the chair's button(s) get chairman-mode privileges."""
    chairs = {p.device_id for p in meeting.participants if p.is_chair and p.device_id}
    return FloorController(mode=meeting.floor_mode, chairs=chairs)


floor = floor_for(store.active) if store.active else FloorController()
pending_turns: set[asyncio.Task] = set()  # transcriptions still running
