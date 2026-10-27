"""Use the computer's microphones as LUBB speaker buttons, for testing without the hardware.

Each microphone connects to the hub exactly like a real button (see docs/device-protocol.md). By default it is
hands-free: when someone starts speaking into a mic it presses that mic's button, and after a second of silence
it releases it, so the hub transcribes the turn. Audio is only sent while the hub has given the button the floor.

    backend/venv/bin/python scripts/mic_button.py                   # every mic, in USB-port order: btn-1, btn-2, …
    backend/venv/bin/python scripts/mic_button.py --list            # the mics, their USB ports, live levels
    backend/venv/bin/python scripts/mic_button.py btn-1             # just the default mic, as btn-1
    backend/venv/bin/python scripts/mic_button.py 1=btn-1 2=btn-3   # choose: mic 1 is btn-1, mic 2 is btn-3
    backend/venv/bin/python scripts/mic_button.py btn-1 --manual    # one mic, press Enter to start / stop
    ... --hub ws://192.168.1.20:8000                                # a hub on another machine

Mics are numbered by the USB port they're plugged into, so the numbers stay the same after a reboot or a replug
in the same port. Use --list and speak into each mic to see which number (and port) it is.

With several mics in one room, every mic also hears the people at the other mics. A voice is given to the mic
that hears it clearly loudest (the one the speaker sits at), so one sentence isn't recorded twice.

Records through PipeWire (pw-record). Stay quiet for the first second: each mic measures the room's noise then.
"""

import argparse
import asyncio
import json
import math
import os
import re
import statistics
import subprocess
import sys
from array import array
from collections import deque

import websockets
from websockets.exceptions import WebSocketException

FRAME = 640  # 20 ms of 16 kHz mono 16-bit audio
CALIBRATE = 50  # frames of room noise measured at start (1 s)
START_AFTER = 3  # loud frames in a row that count as speech (60 ms)
STOP_AFTER = 50  # quiet frames in a row that end the turn (1 s)
PRE_ROLL = 15  # frames kept from just before speech starts (300 ms), so the first word isn't cut
MARGIN = 6.0  # dB: with several mics, a voice belongs to a mic only if it's this much louder there than anywhere else

LEDS = {
    "ready": "🔵 ready",
    "talking": "🟢 talking — the hub is recording",
    "waiting": "🟡 waiting for the floor…",
    "muted": "🔴 muted — no live meeting, or someone else has the floor",
}


def level_db(chunk: bytes) -> float:
    samples = array("h", chunk[: len(chunk) // 2 * 2])
    if not samples:
        return -120.0
    rms = math.sqrt(sum(s * s for s in samples) / len(samples)) / 32768
    return 20 * math.log10(rms) if rms else -120.0


class VoiceGate:
    """Decides, 20 ms at a time, when one mic's button goes down and up. Pure logic, no I/O.

    `others` is how far above their own room noise the other mics hear right now: a voice that's louder at another
    mic belongs to that mic, so this one neither starts a turn for it nor lets it keep its own turn going."""

    def __init__(self):
        self.noise: list[float] = []
        self.room = None  # background noise (dB), once measured
        self.threshold = None
        self.lift = 0.0  # how far above the room this mic hears right now (dB, smoothed)
        self.held = False
        self.loud = self.quiet = 0

    def step(self, db: float, others: list[float]) -> str | None:
        """Returns "press", "release", or None."""
        if self.threshold is None:  # still measuring the room
            self.noise.append(db)
            if len(self.noise) == CALIBRATE:
                self.room = statistics.median(self.noise)
                self.threshold = max(self.room + 12, -50)  # clearly above the room, never so low that hiss counts
            return None
        self.lift = 0.6 * self.lift + 0.4 * (db - self.room)
        loudest_other = max(others, default=-120.0)
        voiced = db > self.threshold
        if not self.held:
            # start only for a voice that's clearly this mic's
            self.loud = self.loud + 1 if voiced and self.lift >= loudest_other + MARGIN else 0
            if self.loud >= START_AFTER:
                self.held, self.loud, self.quiet = True, 0, 0
                return "press"
        else:
            # keep going while the voice isn't clearly someone else's
            self.quiet = 0 if voiced and self.lift > loudest_other - MARGIN else self.quiet + 1
            if self.quiet >= STOP_AFTER:
                self.held, self.quiet = False, 0
                return "release"
        return None


def _usb_port(card: str | None) -> str | None:
    """The USB port path of a sound card, e.g. "3-1.2" (bus 3, port 1, then port 2 of the hub on it)."""
    if card is None:
        return None
    try:
        target = os.path.realpath(f"/sys/class/sound/card{card}/device")
    except OSError:
        return None
    ports = re.findall(r"/(\d+-[\d.]+)(?=[:/])", target)
    return ports[-1] if ports else None


def _natural(port: str | None) -> list:
    return [int(n) for n in re.findall(r"\d+", port)] if port else [10**9]


def list_mics() -> list[dict]:
    """The microphones PipeWire knows, numbered by USB port (so a mic keeps its number in the same port)."""
    dump = json.loads(subprocess.run(["pw-dump"], capture_output=True, text=True, check=True).stdout)
    devices = {o["id"]: (o.get("info") or {}).get("props") or {} for o in dump}
    mics = []
    for obj in dump:
        props = (obj.get("info") or {}).get("props") or {}
        if props.get("media.class") != "Audio/Source":
            continue
        device = devices.get(props.get("device.id"), {})
        card = props.get("api.alsa.card") or device.get("api.alsa.card")
        mics.append(
            {
                "name": props["node.name"],
                "label": props.get("node.description") or props["node.name"],
                "port": _usb_port(None if card is None else str(card)),
            }
        )
    return sorted(mics, key=lambda m: (_natural(m["port"]), m["name"]))


def record(target: str | None) -> subprocess.Popen:
    return subprocess.Popen(
        ["pw-record", "--rate", "16000", "--channels", "1", "--format", "s16", *(["--target", target] if target else []), "-"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )


class Seat:
    """One microphone acting as one button."""

    def __init__(self, button: str, target: str | None, label: str):
        self.button, self.target, self.label = button, target, label
        self.gate = VoiceGate()
        self.led = None
        self.ws = None

    def say(self, text: str) -> None:
        print(f"[{self.button}] {text}")


async def press(seat: Seat, down: bool) -> None:
    seat.gate.held = down
    await seat.ws.send(json.dumps({"type": "button_down" if down else "button_up"}))
    seat.say("🎙  speaking…" if down else "… turn ended, the hub is transcribing")


async def run_seat(seat: Seat, seats: list[Seat], hub: str, manual: bool) -> None:
    loop = asyncio.get_running_loop()
    mic = record(seat.target)
    async with websockets.connect(f"{hub}/ws/device/{seat.button}") as ws:
        seat.ws = ws
        await ws.send(json.dumps({"type": "hello", "firmware": "pc-mic", "battery": 100}))
        seat.say(f"connected — mic {seat.label}")

        async def hub_messages() -> None:
            async for raw in ws:
                msg = json.loads(raw)
                if msg.get("type") == "led" and msg["state"] != seat.led:
                    seat.led = msg["state"]
                    seat.say(LEDS.get(msg["state"], msg["state"]))
                elif msg.get("type") == "floor_denied":
                    seat.say(f"⛔ floor denied ({msg.get('reason')})")

        async def keyboard() -> None:
            seat.say("press Enter to start talking, Enter again to stop")
            while True:
                if not await loop.run_in_executor(None, sys.stdin.readline):  # wait for Enter
                    return  # no keyboard (input closed): just listen
                await press(seat, not seat.gate.held)

        async def audio() -> None:
            pending: deque[bytes] = deque(maxlen=PRE_ROLL)  # recent audio not yet sent
            while True:
                chunk = await loop.run_in_executor(None, mic.stdout.read, FRAME)
                if not chunk:
                    raise RuntimeError(f"The mic {seat.label} stopped (unplugged, or muted at the system level?)")
                if not manual:
                    calibrating = seat.gate.threshold is None
                    others = [s.gate.lift for s in seats if s is not seat and s.gate.room is not None]
                    change = seat.gate.step(level_db(chunk), others)
                    if calibrating and seat.gate.threshold is not None:
                        seat.say(f"room noise {seat.gate.room:.0f} dB → listening for voices above {seat.gate.threshold:.0f} dB")
                    if change == "press":
                        await press(seat, True)
                    elif change == "release":
                        await press(seat, False)
                        pending.clear()
                # like a real button: stream only while held and the hub has granted the floor.
                # Until then keep the last moment, so speech from just before the grant isn't lost.
                pending.append(chunk)
                if seat.gate.held and seat.led == "talking":
                    while pending:
                        await ws.send(pending.popleft())

        try:
            await asyncio.gather(hub_messages(), audio(), *([keyboard()] if manual else []))
        finally:
            mic.terminate()


async def show_levels(mics: list[dict], seconds: float = 12) -> None:
    """Live level bars for every mic, so you can tell which number is which by speaking into one."""
    loop = asyncio.get_running_loop()
    levels = [-120.0] * len(mics)
    procs = [record(m["name"]) for m in mics]

    async def read(i: int) -> None:
        while True:
            chunk = await loop.run_in_executor(None, procs[i].stdout.read, FRAME * 5)
            if not chunk:
                return
            levels[i] = level_db(chunk)

    readers = [asyncio.create_task(read(i)) for i in range(len(mics))]
    print(f"Speak into one mic at a time: its bar moves. ({seconds:.0f} s)\n")
    end = loop.time() + seconds
    while loop.time() < end:
        bars = "   ".join(f"{i + 1}: {'█' * int(max(0, levels[i] + 70) / 3):<20}" for i in range(len(mics)))
        print(f"\r{bars}", end="", flush=True)
        await asyncio.sleep(0.1)
    print()
    for task in readers:
        task.cancel()
    for proc in procs:
        proc.terminate()


def seats_in_port_order() -> list[Seat]:
    """Every connected mic, numbered by USB port: the first one on the hub is btn-1, the next btn-2, and so on."""
    mics = list_mics()
    usb = [m for m in mics if m["port"]] or mics  # the hub's mics (not built-in ones), unless no port is known
    if not usb:
        sys.exit("No microphones found. Check they're plugged in (and the hub has power), then try again.")
    return [Seat(f"btn-{i}", m["name"], f"{i}, USB port {m['port'] or '?'}") for i, m in enumerate(usb, 1)]


def seats_from(args: list[str]) -> list[Seat]:
    """`btn-1` = the default mic as btn-1; `2=btn-3` = mic 2 (its --list number, USB port or system name) as btn-3."""
    mics = list_mics() if any("=" in a for a in args) else []
    seats = []
    for arg in args:
        if "=" not in arg:
            seats.append(Seat(arg, None, "default"))
            continue
        which, button = arg.split("=", 1)
        if which.isdigit() and 0 < int(which) <= len(mics):
            mic = mics[int(which) - 1]
        else:
            mic = next((m for m in mics if which in (m["port"], m["name"])), None)
        if not mic:
            found = "\n".join(f"  {i + 1}. {m['label']}  (USB port {m['port'] or '?'})" for i, m in enumerate(mics)) or "  none"
            sys.exit(f"No mic '{which}'. Connected mics:\n{found}")
        seats.append(Seat(button, mic["name"], f"{mics.index(mic) + 1}, USB port {mic['port'] or '?'}"))
    if len({s.button for s in seats}) < len(seats):
        sys.exit("Each button can be used by one mic only.")
    if len({s.target for s in seats}) < len(seats):
        sys.exit("Each mic can be one button only.")
    return seats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Use this computer's microphones as LUBB speaker buttons.")
    parser.add_argument(
        "seats", nargs="*", help="nothing: every mic in USB-port order (btn-1, btn-2, …); btn-1: the default mic; or MIC=BUTTON pairs"
    )
    parser.add_argument("--list", action="store_true", help="list the connected mics with their USB ports and live levels")
    parser.add_argument("--hub", default="ws://localhost:8000", help="hub address (default ws://localhost:8000)")
    parser.add_argument("--manual", action="store_true", help="one mic only: press Enter to start and stop talking")
    args = parser.parse_args()
    try:
        if args.list:
            mics = list_mics()
            if not mics:
                sys.exit("No microphones found. Check they're plugged in (and the hub has power), then try again.")
            for i, m in enumerate(mics, 1):
                print(f"{i}. {m['label']}   USB port {m['port'] or '?'}   ({m['name']})")
            print()
            asyncio.run(show_levels(mics))
            sys.exit(0)
        if args.seats:
            seats = seats_from(args.seats)
        elif args.manual:
            seats = [Seat("btn-1", None, "default")]
        else:
            seats = seats_in_port_order()
        if args.manual and len(seats) > 1:
            sys.exit("--manual works with one mic; with several, leave it hands-free.")
        sys.stdout.reconfigure(line_buffering=True)  # show each change at once, even when piped
        print("Mics → buttons:")
        for seat in seats:
            print(f"  {seat.button}  ←  mic {seat.label}")
        print(f"Hub {args.hub}. Stay quiet for a second while the mics measure the room. Ctrl+C to quit.")

        async def main() -> None:
            await asyncio.gather(*(run_seat(s, seats, args.hub, args.manual) for s in seats))

        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBye")
    except (OSError, WebSocketException) as exc:
        sys.exit(f"Could not reach the hub at {args.hub}: {exc}")
