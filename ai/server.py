"""LUBB AI server: the meeting AI on this machine's GPU, for the hub on another machine (or on this one).

The same API as the Colab server (colab/server.py), so a hub switches over by changing its URL and token:
  POST /transcribe   16 kHz mono 16-bit PCM body -> {"text", "language"}   (Whisper)
  POST /api/chat     forwarded to Ollama on this machine, streamed back     (the LLM that writes the minutes)
  GET  /health
Every request must carry "Authorization: Bearer $AI_TOKEN".

Whisper runs through PyTorch, which has GPU builds for ARM machines like the DGX Spark (faster-whisper's engine
has none there, so it would run on the CPU). Silences are cut out first with the same voice detector that
faster-whisper's vad_filter uses: silence is what Whisper hallucinates on.

Runs as a systemd user service (lubb-ai.service), with its settings in ai/.env.
"""

import os
import secrets
import threading

import httpx
import numpy as np
import torch
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from faster_whisper.vad import collect_chunks, get_speech_timestamps
from transformers import pipeline

TOKEN = os.environ["AI_TOKEN"]
OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
RATE = 16_000
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
if "/" not in WHISPER_MODEL:  # the hub's short names ("large-v3-turbo") are OpenAI's models
    WHISPER_MODEL = f"openai/whisper-{WHISPER_MODEL}"

whisper = pipeline("automatic-speech-recognition", model=WHISPER_MODEL, dtype=torch.float16, device="cuda:0")
gpu = threading.Lock()  # one turn at a time on the GPU; turns from several mics queue here


def auth(request: Request) -> None:
    if not secrets.compare_digest(request.headers.get("authorization", ""), f"Bearer {TOKEN}"):
        raise HTTPException(401, "Bad or missing AI_TOKEN")


app = FastAPI(title="LUBB AI server", dependencies=[Depends(auth)])


@app.get("/health")
async def health() -> dict:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            tags = (await client.get(f"{OLLAMA}/api/tags")).json()
        llms = [m["name"] for m in tags.get("models", [])]
    except (httpx.HTTPError, ValueError):
        llms = "Ollama is not answering"
    return {"status": "ok", "gpu": torch.cuda.get_device_name(0), "whisper": WHISPER_MODEL, "llm_models": llms}


def _transcribe(pcm: bytes, language: str | None) -> dict:
    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    speech = get_speech_timestamps(audio, sampling_rate=RATE)
    if not speech:
        return {"text": "", "language": language}
    audio = np.concatenate(collect_chunks(audio, speech, sampling_rate=RATE)[0])
    options = {"task": "transcribe", **({"language": language} if language else {})}
    with gpu:
        result = whisper(
            {"raw": audio, "sampling_rate": RATE},
            return_timestamps=len(audio) > 30 * RATE,  # a turn over 30 s is read 30 s at a time
            generate_kwargs=options,
        )
    return {"text": result["text"].strip(), "language": language}


whisper({"raw": np.zeros(RATE, dtype=np.float32), "sampling_rate": RATE})  # warm up: the first run is the slow one


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
