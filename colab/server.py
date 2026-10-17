"""LUBB AI remote GPU server (runs on Google Colab, started by lubb_ai_colab.ipynb).

One URL serves both models, so the hub needs a single tunnel:
  POST /transcribe   16 kHz mono 16-bit PCM body -> {"text", "language"}   (faster-whisper)
  POST /api/chat     forwarded to the local Ollama, streamed back           (LLM)
Every request must carry "Authorization: Bearer $AI_TOKEN".
"""

import os

import httpx
import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel

TOKEN = os.environ["AI_TOKEN"]
OLLAMA = "http://127.0.0.1:11434"
whisper = WhisperModel(os.environ.get("WHISPER_MODEL", "large-v3-turbo"), device="cuda", compute_type="float16")


def auth(request: Request) -> None:
    if request.headers.get("authorization") != f"Bearer {TOKEN}":
        raise HTTPException(401, "Bad or missing AI_TOKEN")


app = FastAPI(title="LUBB AI GPU server", dependencies=[Depends(auth)])


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "whisper": os.environ.get("WHISPER_MODEL"), "llm": os.environ.get("LLM_MODEL")}


def _transcribe(pcm: bytes, language: str | None) -> dict:
    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    segments, info = whisper.transcribe(audio, language=language, vad_filter=True)
    # segments is lazy: consume it here, inside the worker thread
    return {"text": " ".join(s.text.strip() for s in segments), "language": info.language}


@app.post("/transcribe")
async def transcribe(request: Request, language: str | None = None) -> dict:
    return await run_in_threadpool(_transcribe, await request.body(), language)


@app.post("/api/chat")
async def chat(request: Request) -> StreamingResponse:
    client = httpx.AsyncClient(timeout=None)
    upstream = await client.send(
        client.build_request(
            "POST", f"{OLLAMA}/api/chat", content=await request.body(), headers={"Content-Type": "application/json"}
        ),
        stream=True,
    )

    async def body():
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(body(), status_code=upstream.status_code, media_type="application/x-ndjson")
