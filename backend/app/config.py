import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    default_language: str = os.getenv("DEFAULT_LANGUAGE", "ar")
    # Master switch for all microphones. Off: buttons stay muted and their audio is dropped.
    # Turn on once the real button mics are connected.
    mics_enabled: bool = os.getenv("MICS_ENABLED", "true").lower() not in ("0", "false", "no", "off")
    # Speech-to-text. "stub" = placeholder text, "whisper" = faster-whisper on this machine,
    # "remote" = POST audio to STT_URL (e.g. the Colab server in colab/).
    stt_engine: str = os.getenv("STT_ENGINE", "stub")
    whisper_model: str = os.getenv("WHISPER_MODEL", "large-v3-turbo")
    stt_url: str = os.getenv("STT_URL", "").rstrip("/")
    # LLM served by Ollama, locally or remotely (OLLAMA_URL can be the Colab tunnel URL).
    # "stub" = no model, returns placeholder report.
    llm_engine: str = os.getenv("LLM_ENGINE", "stub")
    ollama_url: str = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")
    llm_model: str = os.getenv("LLM_MODEL", "qwen2.5:14b")
    # Shared secret sent as "Authorization: Bearer <token>" to remote AI servers.
    ai_token: str = os.getenv("AI_TOKEN", "")
    db_path: str = os.getenv("DB_PATH", "data/lubb.db")  # relative to where the hub is started
    cors_origins: tuple[str, ...] = ("http://localhost:3000",)

    # Audio format agreed in docs/device-protocol.md
    sample_rate: int = 16_000
    sample_width: int = 2  # bytes (16-bit PCM)


    @property
    def ai_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.ai_token}"} if self.ai_token else {}


settings = Settings()
