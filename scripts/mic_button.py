"""Use the microphones plugged into this computer (e.g. through a USB hub) as LUBB speaker buttons.

Each microphone connects to the hub exactly like a real button (see docs/device-protocol.md). It's hands-free:
when someone starts speaking into a mic it presses that mic's button, and after a second of silence it releases
it, so the hub transcribes the turn. Audio is only sent while the hub has given the button the floor.

Mics are found by the USB port they're plugged into, and recorded from that port's sound card, never by name:
two identical mics in two ports are always two different mics, and a mic keeps its button as long as it stays
in the same port. A USB hub's own port numbers needn't follow the order of its sockets, so its order is set once
(MIC_SOCKETS: the hub's port number for socket 1, socket 2, …; 2,1,4,3 by default, the Unitek Y-3089): the mic in
socket N is always btn-N. With MIC_SOCKETS empty, the first mic in port order is btn-1, the next btn-2, and so on.

The hub starts this by itself (LOCAL_MICS in backend/.env, on by default) with --watch: mics plugged in or out
later are picked up within a few seconds. To run it by hand instead:

    backend/venv/bin/python scripts/mic_button.py --list            # the mics, their USB ports, live levels
    backend/venv/bin/python scripts/mic_button.py                   # every mic now, in port order: btn-1, btn-2, …
    backend/venv/bin/python scripts/mic_button.py --watch           # the same, and keep following plug / unplug
    backend/venv/bin/python scripts/mic_button.py 1=btn-1 2=btn-3   # choose: mic 1 is btn-1, mic 2 is btn-3
    backend/venv/bin/python scripts/mic_button.py btn-1 --manual    # the default mic, press Enter to start / stop
    ... --hub ws://192.168.1.20:8000                                # a hub on another machine
    ... --sockets 2,1,4,3                                           # the hub's socket order (default MIC_SOCKETS)

With several mics in one room, every mic also hears the people at the other mics. A voice is given to the mic
that hears it clearly loudest (the one the speaker sits at), so one sentence isn't recorded twice.

Records with arecord (alsa-utils); falls back to PipeWire if the sound card is busy. Stay quiet for the first
second after a mic connects: it measures the room's noise then.
"""

import argparse
import asyncio
import glob
import itertools
import json
import math
import os
import re
import statistics
import subprocess
import sys
import tempfile
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
REPLACED = 4001  # the hub closes a button's connection with this when another connection takes the same button

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


# ---- Finding mics: by USB port ------------------------------------------------------------------------------


def usb_port(sysfs_device: str) -> str | None:
    """The USB port path in a device's sysfs path, e.g. "3-1.2" = bus 3, port 1, then port 2 of the hub on it."""
    ports = re.findall(r"/(\d+-[\d.]+)(?=[:/])", sysfs_device)
    return ports[-1] if ports else None


def _natural(port: str | None) -> list:
    return [int(n) for n in re.findall(r"\d+", port)] if port else [10**9]


def parse_sockets(text: str) -> list[int]:
    """"2,1,4,3" → [2, 1, 4, 3]: the hub's own port number for socket 1, socket 2, …"""
    try:
        sockets = [int(n) for n in text.replace(" ", "").split(",") if n]
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{text}' should be the hub's port numbers in socket order, like 2,1,4,3") from None
    if len(set(sockets)) < len(sockets):
        raise argparse.ArgumentTypeError(f"'{text}': each port number once")
    return sockets


def socket_number(port: str | None, sockets: list[int]) -> int | None:
    """Which socket of its USB hub a mic is in (1, 2, …), going by the hub's socket order; None if unknown."""
    if not port or "." not in port or not sockets:
        return None
    hub_port = int(port.rsplit(".", 1)[1])
    return sockets.index(hub_port) + 1 if hub_port in sockets else None


def list_mics() -> list[dict]:
    """Every USB microphone, found through the port it sits on, in port order.

    Each Linux sound card links to the USB port it's plugged into; a card that can record is a mic."""
    mics = []
    for path in glob.glob("/sys/class/sound/card[0-9]*"):
        card = path.rsplit("card", 1)[1]
        port = usb_port(os.path.realpath(f"{path}/device"))
        if not port or not glob.glob(f"/proc/asound/card{card}/pcm*c"):
            continue  # not on USB, or can't record
        try:
            with open(f"{path}/id") as f:
                name = f.read().strip()
        except OSError:
            name = f"card {card}"
        mics.append({"card": card, "port": port, "name": name})
    return sorted(mics, key=lambda m: _natural(m["port"]))


# ---- Recording from one port --------------------------------------------------------------------------------


def _pipewire_target(card: str) -> str | None:
    """PipeWire's id for the recording side of a sound card, for when the card is busy (PipeWire holds it)."""
    try:
        dump = json.loads(subprocess.run(["pw-dump"], capture_output=True, text=True, timeout=10).stdout or "[]")
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    devices = {o["id"]: (o.get("info") or {}).get("props") or {} for o in dump}
    for obj in dump:
        props = (obj.get("info") or {}).get("props") or {}
        device = devices.get(props.get("device.id"), {})
        if props.get("media.class") == "Audio/Source" and str(props.get("api.alsa.card", device.get("api.alsa.card"))) == card:
            return str(props.get("object.serial") or props.get("node.name"))
    return None


async def open_mic(card: str | None) -> subprocess.Popen:
    """Start recording 16 kHz mono 16-bit audio from one sound card (None = the system's default mic)."""
    log = tempfile.TemporaryFile()  # arecord's messages, read only if it fails
    device = f"plughw:{card},0" if card is not None else "default"
    proc = subprocess.Popen(
        ["arecord", "-q", "-D", device, "-f", "S16_LE", "-r", "16000", "-c", "1", "-t", "raw"],
        stdout=subprocess.PIPE,
        stderr=log,
    )
    await asyncio.sleep(0.3)
    if proc.poll() is None:
        return proc
    log.seek(0)
    error = log.read().decode(errors="replace").strip().splitlines()[-1:] or ["no audio"]
    target = _pipewire_target(card) if card is not None else None
    if target:  # the card is held by PipeWire: record through it instead, still from this card
        proc = subprocess.Popen(
            ["pw-record", "--rate", "16000", "--channels", "1", "--format", "s16", "--target", target, "-"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        await asyncio.sleep(0.3)
        if proc.poll() is None:
            return proc
    raise RuntimeError(f"can't record from this mic ({error[0]})")


# ---- One mic as one button ----------------------------------------------------------------------------------


class Seat:
    """One microphone (one USB port) acting as one button."""

    def __init__(self, button: str, card: str | None, port: str | None, number: int | None = None, socket: int | None = None):
        self.button, self.card, self.port = button, card, port
        if socket:
            self.label = f"in socket {socket} (USB port {port})"
        else:
            self.label = f"{number}, USB port {port}" if port else "default mic"
        self.gate = VoiceGate()
        self.led = None
        self.ws = None
        self.replaced = False  # another connection took this button over

    def say(self, text: str) -> None:
        print(f"[{self.button}] {text}", flush=True)


async def press(seat: Seat, down: bool) -> None:
    seat.gate.held = down
    await seat.ws.send(json.dumps({"type": "button_down" if down else "button_up"}))
    seat.say("🎙  speaking…" if down else "… turn ended, the hub is transcribing")


async def run_seat(seat: Seat, peers: dict, hub: str, manual: bool = False) -> None:
    """One mic as one button, until the mic or the hub goes away. `peers` = every seat running, this one included."""
    loop = asyncio.get_running_loop()
    mic = await open_mic(seat.card)
    try:
        async with websockets.connect(f"{hub}/ws/device/{seat.button}") as ws:
            seat.ws, seat.led, seat.gate.held = ws, None, False
            await ws.send(json.dumps({"type": "hello", "firmware": "usb-mic", "battery": 100}))
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
                        raise RuntimeError("the mic stopped (unplugged?)")
                    if not manual:
                        calibrating = seat.gate.threshold is None
                        others = [s.gate.lift for s in list(peers.values()) if s is not seat and s.gate.room is not None]
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

            await asyncio.gather(hub_messages(), audio(), *([keyboard()] if manual else []))
    finally:
        mic.terminate()


async def keep_connected(seat: Seat, peers: dict, hub: str) -> None:
    """Watch mode: keep one mic connected, reconnecting whenever the hub restarts or isn't up yet.
    Ends when the mic stops (unplugged) or another connection takes the button over."""
    waiting = False
    while True:
        try:
            await run_seat(seat, peers, hub)
        except WebSocketException as exc:
            if getattr(getattr(exc, "rcvd", None), "code", None) == REPLACED:
                seat.say("another connection took this button over; leaving it to that one")
                seat.replaced = True
                return
            if not waiting:
                seat.say("hub went away, reconnecting…")
                waiting = True
        except OSError:
            if not waiting:
                seat.say("waiting for the hub…")
                waiting = True
        except RuntimeError as exc:  # the mic stopped or can't be opened
            seat.say(str(exc))
            return
        else:
            waiting = False
        await asyncio.sleep(2)


# ---- Which mic is which button ------------------------------------------------------------------------------


def seats_in_port_order(required: bool = True, sockets: list[int] = ()) -> list[Seat]:
    """Every USB mic as a button. With the hub's socket order, the mic in socket N is btn-N, whichever sockets are
    in use, and any other mic comes after the sockets. Without it, port order: btn-1, btn-2, and so on."""
    mics = list_mics()
    if not mics and required:
        sys.exit("No USB microphones found. Check they're plugged in (and the hub has power), then try again.")
    in_socket: dict[str, int] = {}
    for m in mics:
        n = socket_number(m["port"], sockets)
        if n and n not in in_socket.values():  # a second hub's socket N is just "another mic"
            in_socket[m["port"]] = n
    others = itertools.count(len(sockets) + 1)
    seats = []
    for m in mics:
        socket = in_socket.get(m["port"])
        n = socket or next(others)
        seats.append(Seat(f"btn-{n}", m["card"], m["port"], n, socket))
    return seats


def seats_from(args: list[str]) -> list[Seat]:
    """`btn-1` = the default mic as btn-1; `2=btn-3` = mic 2 (its --list number, or its USB port) as btn-3."""
    mics = list_mics() if any("=" in a for a in args) else []
    seats = []
    for arg in args:
        if "=" not in arg:
            seats.append(Seat(arg, None, None))
            continue
        which, button = arg.split("=", 1)
        if which.isdigit() and 0 < int(which) <= len(mics):
            mic = mics[int(which) - 1]
        else:
            mic = next((m for m in mics if m["port"] == which), None)
        if not mic:
            found = "\n".join(f"  {i}. {m['name']}  (USB port {m['port']})" for i, m in enumerate(mics, 1)) or "  none"
            sys.exit(f"No mic '{which}'. USB mics connected:\n{found}")
        seats.append(Seat(button, mic["card"], mic["port"], mics.index(mic) + 1))
    if len({s.button for s in seats}) < len(seats):
        sys.exit("Each button can be used by one mic only.")
    if len({s.port for s in seats}) < len(seats):
        sys.exit("Each mic can be one button only.")
    return seats


async def watch(hub: str, parent: int | None = None, every: float = 3, sockets: list[int] = ()) -> None:
    """Keep every USB mic connected as a button (by socket, or in port order), following mics plugged in or out.
    `parent`: the hub's process id; when the hub is gone, this stops too."""
    seats: dict[str, Seat] = {}
    tasks: dict[str, asyncio.Task] = {}
    shown = None
    while parent is None or os.getppid() == parent:
        wanted = {s.button: s for s in seats_in_port_order(required=False, sockets=sockets)}
        for button in list(tasks):
            moved = button not in wanted or (wanted[button].card, wanted[button].port) != (seats[button].card, seats[button].port)
            # a seat that stopped is started again, unless another connection took the button over
            if moved or (tasks[button].done() and not seats[button].replaced):
                tasks.pop(button).cancel()
                seats.pop(button)
        for button, seat in wanted.items():
            if button not in tasks:
                seats[button] = seat
                tasks[button] = asyncio.create_task(keep_connected(seat, seats, hub))
        mapping = [f"{b} ← mic {seats[b].label}" for b in sorted(seats, key=_natural)]
        if mapping != shown:
            shown = mapping
            print("Mics → buttons:  " + "   ".join(mapping) if mapping else "No USB mics yet: plug them in and they'll connect by themselves.", flush=True)
        await asyncio.sleep(every)
    for task in tasks.values():
        task.cancel()


async def show_levels(mics: list[dict], seconds: float = 12) -> None:
    """Live level bars for every mic, so you can tell which number is which by speaking into one."""
    loop = asyncio.get_running_loop()
    levels = [-120.0] * len(mics)
    procs = [await open_mic(m["card"]) for m in mics]

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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Use the USB microphones on this computer as LUBB speaker buttons.")
    parser.add_argument("seats", nargs="*", help="nothing: every USB mic in port order (btn-1, btn-2, …); btn-1: the default mic; or MIC=BUTTON pairs")
    parser.add_argument("--list", action="store_true", help="list the USB mics with their ports and live levels")
    parser.add_argument("--watch", action="store_true", help="keep following mics plugged in or out (what the hub runs)")
    parser.add_argument("--hub", default="ws://localhost:8000", help="hub address (default ws://localhost:8000)")
    parser.add_argument(
        "--sockets",
        type=parse_sockets,
        default=os.environ.get("MIC_SOCKETS", "2,1,4,3"),  # the Unitek Y-3089, as in backend/app/config.py
        help="the USB hub's port number for socket 1, socket 2, … e.g. 2,1,4,3: then the mic in socket N is btn-N",
    )
    parser.add_argument("--parent", type=int, help=argparse.SUPPRESS)  # set by the hub: stop when it stops
    parser.add_argument("--manual", action="store_true", help="one mic only: press Enter to start and stop talking")
    args = parser.parse_args()
    sys.stdout.reconfigure(line_buffering=True)  # show each change at once, even when piped
    try:
        if args.list:
            mics = list_mics()
            if not mics:
                sys.exit("No USB microphones found. Check they're plugged in (and the hub has power), then try again.")
            for i, m in enumerate(mics, 1):
                socket = socket_number(m["port"], args.sockets)
                where = f"socket {socket}, " if socket else ""
                print(f"{i}. {m['name']}   {where}USB port {m['port']}   (sound card {m['card']})")
            print()
            asyncio.run(show_levels(mics))
            sys.exit(0)
        if args.watch:
            order = "the mic in socket N is btn-N" if args.sockets else "as btn-1, btn-2, … in port order"
            print(f"Watching for USB mics; they connect to the hub at {args.hub}, {order}.")
            asyncio.run(watch(args.hub, args.parent, sockets=args.sockets))
            sys.exit(0)
        if args.seats:
            seats = seats_from(args.seats)
        elif args.manual:
            seats = [Seat("btn-1", None, None)]
        else:
            seats = seats_in_port_order(sockets=args.sockets)
        if args.manual and len(seats) > 1:
            sys.exit("--manual works with one mic; with several, leave it hands-free.")
        print("Mics → buttons:")
        for seat in seats:
            print(f"  {seat.button}  ←  mic {seat.label}")
        print(f"Hub {args.hub}. Stay quiet for a second while the mics measure the room. Ctrl+C to quit.")
        peers = {s.button: s for s in seats}

        async def main() -> None:
            await asyncio.gather(*(run_seat(s, peers, args.hub, args.manual) for s in seats))

        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBye")
    except RuntimeError as exc:
        sys.exit(f"Microphone problem: {exc}")
    except (OSError, WebSocketException) as exc:
        sys.exit(f"Could not reach the hub at {args.hub}: {exc}")
