"""Presentations shown in the meeting room: upload a PowerPoint, get one image per slide.

Conversion runs on the hub itself (LibreOffice -> PDF -> PNG with pdftoppm), so files never leave the room.
Each presentation lives in its own folder under data/presentations/<id>/ with a meta.json beside the slides.
"""

import asyncio
import json
import shutil
import subprocess
import threading
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..config import settings
from ..models import SlideRef, SlideShown, new_id
from ..realtime import manager
from ..store import store

router = APIRouter(prefix="/api/presentations", tags=["presentations"])

ROOT = Path(settings.db_path).parent / "presentations"
ACCEPTED = {".pptx", ".ppt", ".odp", ".key", ".pdf"}
MAX_BYTES = 200 * 1024 * 1024
_convert_lock = threading.Lock()  # one LibreOffice at a time: parallel runs fight over its profile
_tasks: set[asyncio.Task] = set()


def _meta_path(pid: str) -> Path:
    return ROOT / pid / "meta.json"


def _read(pid: str) -> dict:
    path = _meta_path(pid)
    if not pid.isalnum() or not path.exists():  # isalnum: ids are hex, so no "../" tricks
        raise HTTPException(404, "Presentation not found")
    return json.loads(path.read_text())


def _write(meta: dict) -> dict:
    _meta_path(meta["id"]).write_text(json.dumps(meta, ensure_ascii=False))
    return meta


@router.get("")
def list_presentations() -> list[dict]:
    if not ROOT.exists():
        return []
    items = [json.loads(p.read_text()) for p in ROOT.glob("*/meta.json")]
    return sorted(items, key=lambda m: m["created_at"], reverse=True)


@router.post("")
async def upload_presentation(request: Request, name: str) -> dict:
    """Body = the raw file. `name` = original file name (its extension decides how it's converted)."""
    suffix = Path(name).suffix.lower()
    if suffix not in ACCEPTED:
        raise HTTPException(422, "Upload a PowerPoint (.pptx, .ppt), Keynote, OpenDocument (.odp) or PDF file")
    data = await request.body()
    if not data:
        raise HTTPException(422, "The file is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The file is larger than 200 MB")

    pid = new_id()
    folder = ROOT / pid
    folder.mkdir(parents=True)
    (folder / f"source{suffix}").write_bytes(data)
    meta = _write(
        {
            "id": pid,
            "title": Path(name).stem,
            "filename": name,
            "size": len(data),
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "status": "converting",
            "slides": 0,
            "error": None,
        }
    )
    task = asyncio.create_task(_convert_in_background(pid))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return meta


async def _convert_in_background(pid: str) -> None:
    meta = _read(pid)
    try:
        meta["slides"] = await asyncio.to_thread(_convert, ROOT / pid)
        meta["status"] = "ready"
    except Exception as exc:  # missing LibreOffice, corrupt file, timeout…
        meta["status"], meta["error"] = "failed", str(exc)[:300]
    if _meta_path(pid).exists():  # not deleted meanwhile
        _write(meta)
        await manager.broadcast({"type": "presentation_ready", "presentation": meta})


def _convert(folder: Path) -> int:
    """source.* -> slides/1.png, 2.png, …; returns the slide count."""
    source = next(folder.glob("source.*"))
    pdf = source
    if source.suffix.lower() != ".pdf":
        office = shutil.which("soffice") or shutil.which("libreoffice")
        if not office:
            raise RuntimeError("LibreOffice is not installed on the hub (sudo apt install libreoffice-impress)")
        profile = (ROOT / ".lo-profile").resolve()
        with _convert_lock:
            subprocess.run(
                [office, "--headless", f"-env:UserInstallation=file://{profile}", "--convert-to", "pdf", "--outdir", str(folder), str(source)],
                check=True,
                capture_output=True,
                timeout=300,
            )
        pdf = folder / "source.pdf"
        if not pdf.exists():
            raise RuntimeError("LibreOffice could not open this file")
    if not shutil.which("pdftoppm"):
        raise RuntimeError("pdftoppm is not installed on the hub (sudo apt install poppler-utils)")
    slides = folder / "slides"
    slides.mkdir(exist_ok=True)
    # 1600 px on the long side: sharp on a room screen, still light
    subprocess.run(["pdftoppm", "-png", "-scale-to", "1600", str(pdf), str(slides / "s")], check=True, capture_output=True, timeout=300)
    pages = sorted(slides.glob("s-*.png"), key=lambda p: int(p.stem.split("-")[-1]))
    for n, page in enumerate(pages, start=1):
        page.rename(slides / f"{n}.png")
    if not pages:
        raise RuntimeError("The presentation has no slides")
    return len(pages)


@router.get("/{pid}")
def get_presentation(pid: str) -> dict:
    return _read(pid)


@router.get("/{pid}/slides/{n}.png")
def slide_image(pid: str, n: int) -> FileResponse:
    meta = _read(pid)
    if not 1 <= n <= meta["slides"]:
        raise HTTPException(404, "No such slide")
    # Slides never change once converted, so browsers can keep them
    return FileResponse(ROOT / pid / "slides" / f"{n}.png", media_type="image/png", headers={"Cache-Control": "public, max-age=31536000, immutable"})


class Show(BaseModel):
    slide: int


def _recording() -> dict:
    meeting = store.active
    return {"recording": bool(meeting), "meeting_id": meeting.id if meeting else None, "meeting_title": meeting.title if meeting else None}


@router.post("/{pid}/show")
async def show_slide(pid: str, body: Show) -> dict:
    """The presenter moved to a slide. If a meeting is live it keeps recording, and remembers the slide:
    turns spoken now are tagged with it and the minutes can follow the deck."""
    meta = _read(pid)
    if not 1 <= body.slide <= max(meta["slides"], 1):
        raise HTTPException(422, "No such slide")
    ref = SlideRef(presentation_id=pid, title=meta["title"], slide=body.slide)
    if meeting := store.active:
        if meeting.now_showing != ref:
            meeting.now_showing = ref
            meeting.slides_shown.append(SlideShown(**ref.model_dump(), at=datetime.now()))
            store.save(meeting)
    await manager.broadcast({"type": "slide", "showing": ref.model_dump(), "slides": meta["slides"], **_recording()})
    return _recording()


@router.post("/stop")
async def stop_presenting() -> dict:
    """Presenter closed the deck: the room screen is back to the meeting. Recording is unaffected."""
    if (meeting := store.active) and meeting.now_showing:
        meeting.now_showing = None
        store.save(meeting)
    await manager.broadcast({"type": "slide", "showing": None, **_recording()})
    return _recording()


@router.delete("/{pid}", status_code=204)
def delete_presentation(pid: str) -> None:
    _read(pid)
    shutil.rmtree(ROOT / pid, ignore_errors=True)
