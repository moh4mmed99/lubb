from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import devices, meetings, presentations
from .services import local_mics


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # USB mics on this machine connect as buttons by themselves while the hub runs
    mics = local_mics.start() if settings.local_mics else None
    yield
    local_mics.stop(mics)


app = FastAPI(title="LUBB AI Hub", version="1.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings.router)
app.include_router(devices.router)
app.include_router(presentations.router)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": app.version,
        "stt": settings.stt_engine,
        "llm": settings.llm_engine,
        "mics": settings.mics_enabled,
        "local_mics": settings.local_mics,
    }
