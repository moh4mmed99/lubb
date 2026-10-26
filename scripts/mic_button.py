"""Use the PC's microphone as a LUBB speaker button, for testing without the hardware.

It connects to the hub exactly like a real button (see docs/device-protocol.md). By default it is
hands-free: when you start speaking it presses the button, and after a second of silence it releases
it, so the hub transcribes the turn. Audio is only sent while the hub has given this button the floor.

    backend/venv/bin/python scripts/mic_button.py                  # acts as btn-1, hands-free
    backend/venv/bin/python scripts/mic_button.py btn-2            # any other button id
    backend/venv/bin/python scripts/mic_button.py btn-1 --manual   # press Enter to start / stop instead
    backend/venv/bin/python scripts/mic_button.py btn-1 --hub ws://192.168.1.20:8000   # a hub on another machine

Records from the default microphone through PipeWire (pw-record); pick the mic in the system sound settings.
Stay quiet for the first second after starting: it measures the room's background noise then.
"""

import argparse
import asyncio
import json
import math
import statistics
import subprocess
import sys
from array import array
from collections import deque

import websockets

FRAME = 640  # 20 ms of 16 kHz mono 16-bit audio
CALIBRATE = 50  # frames of room noise measured at start (1 s)
START_AFTER = 3  # loud frames in a row that count as speech (60 ms)
STOP_AFTER = 50  # quiet frames in a row that end the turn (1 s)
PRE_ROLL = 15  # frames kept from just before speech starts (300 ms), so the first word isn't cut

LEDS = {
    "ready": "🔵 ready",
    "talking": "🟢 talking — the hub is recording you",
    "waiting": "🟡 waiting for the floor…",
    "muted": "🔴 muted — no live meeting, or someone else has the floor",
}


def level_db(chunk: bytes) -> float:
    samples = array("h", chunk[: len(chunk) // 2 * 2])
    if not samples:
        return -120.0
    rms = math.sqrt(sum(s * s for s in samples) / len(samples)) / 32768
    return 20 * math.log10(rms) if rms else -120.0


async def main(device: str, hub: str, manual: bool) -> None:
    sys.stdout.reconfigure(line_buffering=True)  # show each change at once, even when piped
    state = {"led": None, "held": False}
    mic = subprocess.Popen(
        ["pw-record", "--rate", "16000", "--channels", "1", "--format", "s16", "-"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    loop = asyncio.get_running_loop()

    async with websockets.connect(f"{hub}/ws/device/{device}") as ws:
        await ws.send(json.dumps({"type": "hello", "firmware": "pc-mic", "battery": 100}))
        print(f"Connected to {hub} as {device}. Ctrl+C to quit.")

        async def press(down: bool) -> None:
            state["held"] = down
            await ws.send(json.dumps({"type": "button_down" if down else "button_up"}))
            print("🎙  speaking…" if down else "… turn ended, the hub is transcribing")

        async def hub_messages() -> None:
            async for raw in ws:
                msg = json.loads(raw)
                if msg.get("type") == "led" and msg["state"] != state["led"]:
                    state["led"] = msg["state"]
                    print(LEDS.get(msg["state"], msg["state"]))
                elif msg.get("type") == "floor_denied":
                    print(f"⛔ floor denied ({msg.get('reason')})")

        async def keyboard() -> None:
            while True:
                if not await loop.run_in_executor(None, sys.stdin.readline):  # wait for Enter
                    return  # no keyboard (input closed): just listen
                await press(not state["held"])

        async def audio() -> None:
            noise: list[float] = []
            threshold = None
            loud = quiet = 0
            pending: deque[bytes] = deque(maxlen=PRE_ROLL)  # recent audio not yet sent
            if manual:
                print("Press Enter to start talking, Enter again to stop.")
            else:
                print("Measuring the room's background noise — stay quiet for a second…")
            while True:
                chunk = await loop.run_in_executor(None, mic.stdout.read, FRAME)
                if not chunk:
                    raise RuntimeError("The microphone stopped (is pw-record available and a mic selected?)")

                if not manual:
                    db = level_db(chunk)
                    if threshold is None:  # still calibrating
                        noise.append(db)
                        if len(noise) == CALIBRATE:
                            # speech = clearly above the room, but never so low that hiss counts
                            room = statistics.median(noise)
                            threshold = max(room + 12, -50)
                            print(f"Room noise {room:.0f} dB → listening for voices above {threshold:.0f} dB. Just talk.")
                        continue
                    if db > threshold:
                        loud, quiet = loud + 1, 0
                    else:
                        loud, quiet = 0, quiet + 1
                    if not state["held"] and loud >= START_AFTER:
                        await press(True)
                    elif state["held"] and quiet >= STOP_AFTER:
                        await press(False)
                        pending.clear()

                # like a real button: stream only while held and the hub has granted the floor.
                # Until then keep the last moment, so speech from just before the grant isn't lost.
                pending.append(chunk)
                if state["held"] and state["led"] == "talking":
                    while pending:
                        await ws.send(pending.popleft())

        await asyncio.gather(hub_messages(), audio(), *([keyboard()] if manual else []))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Use this PC's microphone as a LUBB speaker button.")
    parser.add_argument("device", nargs="?", default="btn-1", help="button id to act as (default btn-1)")
    parser.add_argument("--hub", default="ws://localhost:8000", help="hub address (default ws://localhost:8000)")
    parser.add_argument("--manual", action="store_true", help="press Enter to start and stop talking")
    args = parser.parse_args()
    try:
        asyncio.run(main(args.device, args.hub, args.manual))
    except KeyboardInterrupt:
        print("\nBye")
    except (OSError, websockets.exceptions.WebSocketException) as exc:
        sys.exit(f"Could not reach the hub at {args.hub}: {exc}")
