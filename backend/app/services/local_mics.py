"""Microphones plugged into the hub machine (e.g. through a USB hub), used as buttons.

With LOCAL_MICS on (the default), the hub starts scripts/mic_button.py --watch beside itself: it finds every USB
mic by the port it's plugged into, numbers them in port order (btn-1, btn-2, …), follows mics plugged in or out,
and connects each to the hub like a button. It runs as a separate process, so a microphone problem can never take
the hub down; it stops when the hub stops.
"""

import logging
import os
import subprocess
import sys
from pathlib import Path

from ..config import settings

log = logging.getLogger("lubb.mics")
SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "mic_button.py"


def start() -> subprocess.Popen | None:
    if not SCRIPT.exists():
        log.warning("USB mics: %s not found, so mics plugged into this machine won't connect", SCRIPT)
        return None
    # its lines ("[btn-1] connected…") go to the hub's own terminal
    args = ["--watch", "--hub", settings.local_mics_hub, "--parent", str(os.getpid()), "--sockets", settings.mic_sockets]
    return subprocess.Popen([sys.executable, str(SCRIPT), *args])


def stop(proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
