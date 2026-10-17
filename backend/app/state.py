"""Runtime state for the live meeting."""

import asyncio

from .floor_control import FloorController
from .store import store

floor = FloorController(mode=store.active.floor_mode) if store.active else FloorController()
pending_turns: set[asyncio.Task] = set()  # transcriptions still running
