from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import devices, meetings

app = FastAPI(title="LUBB AI Hub", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings.router)
app.include_router(devices.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "version": app.version, "stt": settings.stt_engine, "llm": settings.llm_engine}
