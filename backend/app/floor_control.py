"""Decides who may talk. Pure logic, no I/O, so it is easy to test.

See docs/device-protocol.md for the modes and LED states.
"""

from dataclasses import dataclass, field

from .models import FloorMode

READY, TALKING, WAITING, MUTED = "ready", "talking", "waiting", "muted"


@dataclass
class FloorController:
    mode: FloorMode = FloorMode.free
    max_concurrent: int = 2  # only used in free mode
    talking: list[str] = field(default_factory=list)
    queue: list[str] = field(default_factory=list)

    def request(self, device_id: str) -> dict[str, str]:
        """Button pressed. Returns {device_id: led_state} for every device whose LED changes."""
        if device_id in self.talking or device_id in self.queue:
            return {}
        limit = self.max_concurrent if self.mode == FloorMode.free else 1
        if len(self.talking) < limit:
            self.talking.append(device_id)
            changes = {device_id: TALKING}
            if self.mode == FloorMode.one_at_a_time and len(self.talking) >= limit:
                changes |= {"*": MUTED}  # all other buttons go red
            return changes
        if self.mode == FloorMode.queue:
            self.queue.append(device_id)
            return {device_id: WAITING}
        return {device_id: MUTED}

    def release(self, device_id: str) -> dict[str, str]:
        """Button released. Returns LED changes, possibly granting the floor to the next in queue."""
        if device_id in self.queue:
            self.queue.remove(device_id)
            return {device_id: READY}
        if device_id not in self.talking:
            return {}
        self.talking.remove(device_id)
        changes = {device_id: READY}
        if self.mode == FloorMode.queue and self.queue:
            nxt = self.queue.pop(0)
            self.talking.append(nxt)
            changes[nxt] = TALKING
        elif self.mode == FloorMode.one_at_a_time:
            changes = {"*": READY}
        return changes

    def is_talking(self, device_id: str) -> bool:
        return device_id in self.talking
