"""Meeting recordings: the audio of every transcribed turn, kept beside the database (RECORD_AUDIO).

Each turn is one WAV file, data/recordings/<meeting id>/<utterance id>.wav, in the buttons' format (16 kHz mono
16-bit). A meeting's recording is its turns one after another in speaking order, with a short pause between them.
It's put together when someone asks for it, and kept until the next turn arrives.
"""

import shutil
import tempfile
import wave
from pathlib import Path

from ..config import settings
from ..models import Meeting

ROOT = Path(settings.db_path).parent / "recordings"
GAP = 0.6  # seconds of silence between two turns in a meeting's recording


def _folder(meeting_id: str) -> Path:
    return ROOT / meeting_id


def _write(target, chunks) -> None:
    with wave.open(target, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(settings.sample_width)
        w.setframerate(settings.sample_rate)
        for chunk in chunks:
            w.writeframes(chunk)


def save_turn(meeting_id: str, utterance_id: str, pcm: bytes) -> None:
    folder = _folder(meeting_id)
    folder.mkdir(parents=True, exist_ok=True)
    _write(str(folder / f"{utterance_id}.wav"), [pcm])


def meeting_audio(meeting: Meeting) -> Path | None:
    """The whole meeting as one WAV file, or None if none of its turns was recorded."""
    folder = _folder(meeting.id)
    turns = [p for p in (folder / f"{u.id}.wav" for u in meeting.utterances if u.audio) if p.exists()]
    if not turns:
        return None
    whole = folder / "meeting.wav"
    if whole.exists() and whole.stat().st_mtime >= max(p.stat().st_mtime for p in turns):
        return whole
    gap = bytes(int(GAP * settings.sample_rate) * settings.sample_width)

    def chunks():
        for i, path in enumerate(turns):
            if i:
                yield gap
            with wave.open(str(path), "rb") as w:
                yield w.readframes(w.getnframes())

    # written beside it, then swapped in: a listener never gets a half-written file
    with tempfile.NamedTemporaryFile(dir=folder, suffix=".tmp", delete=False) as tmp:
        _write(tmp, chunks())
    Path(tmp.name).replace(whole)
    return whole


def delete(meeting_id: str) -> None:
    shutil.rmtree(_folder(meeting_id), ignore_errors=True)
