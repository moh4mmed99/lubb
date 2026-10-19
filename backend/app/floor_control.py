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
    chairs: set[str] = field(default_factory=set)  # the chair's button(s): may speak without asking

    def request(self, device_id: str) -> dict[str, str]:
        """Button pressed. Returns {device_id: led_state} for every device whose LED changes."""
        if device_id in self.talking or device_id in self.queue:
            return {}
        if self.mode == FloorMode.chairman:
            # Pressing asks to speak; only the chair hands out the floor (grant). The chair's own
            # button speaks straight away when nobody else holds the floor.
            if device_id in self.chairs and not self.talking:
                self.talking.append(device_id)
                return {device_id: TALKING}
            self.queue.append(device_id)
            return {device_id: WAITING}
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
        if self.mode == FloorMode.chairman:
            return {}  # the floor (and a raised hand) stays until the chair changes it
        return self.drop(device_id)

    def drop(self, device_id: str) -> dict[str, str]:
        """Device gone (disconnect/reconnect) or floor taken back: free whatever it held, in any mode."""
        if self.mode == FloorMode.chairman:
            if device_id in self.queue:
                self.queue.remove(device_id)
                return {device_id: READY}
            if device_id in self.talking:
                self.talking.remove(device_id)
                return {device_id: READY}
            return {}
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

    def grant(self, device_id: str) -> dict[str, str]:
        """Chair gives the floor to one device; whoever had it goes back to ready."""
        changes = {d: READY for d in self.talking if d != device_id}
        if device_id in self.queue:
            self.queue.remove(device_id)
        self.talking = [device_id]
        return changes | {device_id: TALKING}

    def revoke(self) -> dict[str, str]:
        """Chair takes the floor back from whoever has it."""
        changes = {d: READY for d in self.talking}
        self.talking = []
        return changes

    def is_talking(self, device_id: str) -> bool:
        return device_id in self.talking
