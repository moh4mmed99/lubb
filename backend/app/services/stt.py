"""Speech-to-text. Runs locally on the hub.

STT_ENGINE=stub     -> placeholder text (no GPU needed, for UI development)
STT_ENGINE=whisper  -> faster-whisper (pip install faster-whisper)
STT_ENGINE=remote   -> POST the PCM to STT_URL/transcribe (the AI PC in ai/, or colab/)

Whatever engine runs, its text goes through clean() before it's kept.
"""

import re
from functools import lru_cache

from ..config import settings

# Whisper "hallucinations": text it learned from subtitle credits and video outros, which it produces on
# silence or noise, not speech. Removed wherever they appear, ignoring Arabic diacritics, case and spacing.
_PHANTOMS = [
    "ترجمة نانسي قنقر",
    "نانسي قنقر",
    "اشتركوا في القناة",
    "اشترك في القناة",
    "لا تنسوا الاشتراك",
    "شكرا للمشاهدة",
    "شكرا على المشاهدة",
    "شكرا لكم على المشاهدة",
    "subtitles by the amara.org community",
    "subtitles by",
    "translated by",
    "thanks for watching",
    "thank you for watching",
    "please subscribe",
]
_MARKS = "[ً-ْـ]*"  # Arabic diacritics and tatweel, allowed between any two letters


def _loose(phrase: str) -> str:
    """A regex for the phrase that tolerates diacritics inside words and any spacing between them."""
    words = [_MARKS.join(re.escape(ch) for ch in word) for word in phrase.split()]
    return r"\s*".join(words) + r"[.،,!؟?]*"


_PHANTOM_RE = re.compile("|".join(_loose(p) for p in _PHANTOMS), re.IGNORECASE)
# a phrase (2+ words) repeated back to back, as Whisper does when it gets stuck in a loop
_LOOP_RE = re.compile(r"(\b\S+(?:\s+\S+)+?)(?:[\s.،,]+\1\b)+")


def clean(text: str) -> str:
    """Removes phantom phrases and repetition loops from a transcribed turn."""
    text = _PHANTOM_RE.sub(" ", text)
    text = _LOOP_RE.sub(r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    return "" if re.fullmatch(r"[\W_]*", text) else text  # only punctuation left: nothing was said


@lru_cache
def _whisper_model():
    from faster_whisper import WhisperModel

    return WhisperModel(settings.whisper_model, device="auto", compute_type="auto")


def transcribe(pcm: bytes, language: str | None = None) -> tuple[str, str | None]:
    """Transcribe one push-to-talk turn of 16 kHz mono 16-bit PCM. Returns (text, language).

    `language` is the meeting's language: guessing it per turn misfires on short or noisy turns."""
    seconds = len(pcm) / (settings.sample_rate * settings.sample_width)
    if settings.stt_engine == "stub":
        return f"[{seconds:.1f}s audio — transcription stub]", language

    if settings.stt_engine == "remote":
        import httpx

        resp = httpx.post(
            f"{settings.stt_url}/transcribe",
            content=pcm,
            params={"language": language} if language else None,
            headers={**settings.ai_headers, "Content-Type": "application/octet-stream"},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        return clean(data["text"]), data.get("language")

    import numpy as np

    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    segments, info = _whisper_model().transcribe(
        audio,
        language=language,
        vad_filter=True,  # cut out the silences before Whisper sees them: silence is what it hallucinates on
        condition_on_previous_text=False,  # stops one wrong phrase from repeating through a long turn
    )
    return clean(" ".join(s.text.strip() for s in segments)), info.language
