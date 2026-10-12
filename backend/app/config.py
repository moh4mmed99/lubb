import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    default_language: str = os.getenv("DEFAULT_LANGUAGE", "ar")
    # Speech-to-text (faster-whisper). "stub" = no model, returns placeholder text.
    stt_engine: str = os.getenv("STT_ENGINE", "stub")
    whisper_model: str = os.getenv("WHISPER_MODEL", "large-v3-turbo")
    # Local LLM served by Ollama. "stub" = no model, returns placeholder report.
    llm_engine: str = os.getenv("LLM_ENGINE", "stub")
    ollama_url: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
    llm_model: str = os.getenv("LLM_MODEL", "qwen2.5:14b")
    cors_origins: tuple[str, ...] = ("http://localhost:5173",)

    # Audio format agreed in docs/device-protocol.md
    sample_rate: int = 16_000
    sample_width: int = 2  # bytes (16-bit PCM)


settings = Settings()
