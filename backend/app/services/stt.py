"""Speech-to-text. Runs locally on the hub.

STT_ENGINE=stub     -> placeholder text (no GPU needed, for UI development)
STT_ENGINE=whisper  -> faster-whisper (pip install faster-whisper)
STT_ENGINE=remote   -> POST the PCM to STT_URL/transcribe (see colab/)
"""

from functools import lru_cache

from ..config import settings


@lru_cache
def _whisper_model():
    from faster_whisper import WhisperModel

    return WhisperModel(settings.whisper_model, device="auto", compute_type="auto")


def transcribe(pcm: bytes, language: str | None = None) -> tuple[str, str | None]:
    """Transcribe one push-to-talk turn of 16 kHz mono 16-bit PCM. Returns (text, language)."""
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
        return data["text"], data.get("language")

    import numpy as np

    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    # language=None lets Whisper detect Arabic/English per turn
    segments, info = _whisper_model().transcribe(audio, language=language, vad_filter=True)
    return " ".join(s.text.strip() for s in segments), info.language
