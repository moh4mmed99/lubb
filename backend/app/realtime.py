"""WebSocket connection registry for dashboards and devices."""

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.dashboards: set[WebSocket] = set()
        self.devices: dict[str, WebSocket] = {}

    async def broadcast(self, event: dict) -> None:
        """Send an event to every open dashboard."""
        for ws in list(self.dashboards):
            try:
                await ws.send_json(event)
            except Exception:
                self.dashboards.discard(ws)

    async def set_leds(self, changes: dict[str, str]) -> None:
        """Apply LED changes from FloorController. Key "*" means every other device."""
        default = changes.get("*")
        targets = {d: default for d in self.devices} if default else {}
        targets |= {k: v for k, v in changes.items() if k != "*"}
        for device_id, led in targets.items():
            if ws := self.devices.get(device_id):
                await ws.send_json({"type": "led", "state": led})
            await self.broadcast({"type": "speaker_state", "device_id": device_id, "state": led})


manager = ConnectionManager()
