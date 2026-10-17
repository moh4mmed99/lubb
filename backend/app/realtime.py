"""WebSocket connection registry for dashboards and devices."""

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.dashboards: set[WebSocket] = set()
        self.devices: dict[str, WebSocket] = {}
        # Last known LED state and battery per connected device, so a dashboard opened mid-meeting is accurate.
        self.leds: dict[str, str] = {}
        self.battery: dict[str, int | None] = {}

    def snapshot(self) -> list[dict]:
        return [
            {"device_id": d, "state": self.leds.get(d), "battery": self.battery.get(d)} for d in sorted(self.devices)
        ]

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
                self.leds[device_id] = led
                try:
                    await ws.send_json({"type": "led", "state": led})
                except Exception:
                    pass  # the device handler cleans up on disconnect
            await self.broadcast({"type": "speaker_state", "device_id": device_id, "state": led})


manager = ConnectionManager()
