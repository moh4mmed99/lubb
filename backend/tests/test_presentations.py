import shutil
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app

needs_poppler = pytest.mark.skipif(not shutil.which("pdftoppm"), reason="pdftoppm (poppler-utils) not installed")


def _pdf(pages: int) -> bytes:
    """A minimal valid PDF with `pages` blank A4-landscape pages."""
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", ""]
    kids = []
    for i in range(pages):
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] >>")
        kids.append(f"{i + 3} 0 R")
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {pages} >>"
    out, offsets = b"%PDF-1.4\n", []
    for n, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{n} 0 obj\n{body}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


def _wait_ready(client: TestClient, pid: str) -> dict:
    for _ in range(100):
        meta = client.get(f"/api/presentations/{pid}").json()
        if meta["status"] != "converting":
            return meta
        time.sleep(0.05)
    raise AssertionError("conversion did not finish")


@needs_poppler
def test_upload_converts_to_slide_images_and_deletes():
    with TestClient(app) as client:
        meta = client.post("/api/presentations?name=عرض الربع.pdf", content=_pdf(3)).json()
        assert meta["status"] == "converting" and meta["title"] == "عرض الربع"
        done = _wait_ready(client, meta["id"])
        assert done["status"] == "ready" and done["slides"] == 3

        slide = client.get(f"/api/presentations/{meta['id']}/slides/2.png")
        assert slide.status_code == 200 and slide.content[:4] == b"\x89PNG"
        assert client.get(f"/api/presentations/{meta['id']}/slides/4.png").status_code == 404
        assert meta["id"] in [p["id"] for p in client.get("/api/presentations").json()]

        assert client.delete(f"/api/presentations/{meta['id']}").status_code == 204
        assert client.get(f"/api/presentations/{meta['id']}").status_code == 404


def test_upload_rejects_other_files_and_bad_ids():
    with TestClient(app) as client:
        assert client.post("/api/presentations?name=notes.txt", content=b"hello").status_code == 422
        assert client.post("/api/presentations?name=deck.pptx", content=b"").status_code == 422
        assert client.get("/api/presentations/..%2F..%2Fetc").status_code == 404


def test_broken_file_reports_failure():
    with TestClient(app) as client:
        meta = client.post("/api/presentations?name=broken.pdf", content=b"%PDF-1.4 not really").json()
        assert _wait_ready(client, meta["id"])["status"] == "failed"


@needs_poppler
def test_presenting_keeps_recording_and_tags_turns_with_the_slide():
    with TestClient(app) as client:
        deck = _wait_ready(client, client.post("/api/presentations?name=Q3.pdf", content=_pdf(3)).json()["id"])
        # no meeting live: showing a slide works, nothing is recorded
        assert client.post(f"/api/presentations/{deck['id']}/show", json={"slide": 1}).json()["recording"] is False

        meeting = client.post("/api/meetings", json={"title": "Review", "participants": [{"name": "سعيد", "device_id": "btn-15"}]}).json()
        client.post(f"/api/meetings/{meeting['id']}/start")
        shown = client.post(f"/api/presentations/{deck['id']}/show", json={"slide": 2}).json()
        assert shown == {"recording": True, "meeting_id": meeting["id"], "meeting_title": "Review"}

        with client.websocket_connect("/api/meetings/ws") as dash, client.websocket_connect("/ws/device/btn-15") as btn:
            btn.receive_json()
            btn.send_json({"type": "button_down"})
            assert btn.receive_json() == {"type": "led", "state": "talking"}  # buttons work while presenting
            btn.send_bytes(b"\x00\x00" * 8_000)
            btn.send_json({"type": "button_up"})
            btn.receive_json()
            event = dash.receive_json()
            while event["type"] != "utterance":
                event = dash.receive_json()
            assert event["utterance"]["slide"] == {"presentation_id": deck["id"], "title": "Q3", "slide": 2}

        saved = client.get(f"/api/meetings/{meeting['id']}").json()
        assert [s["slide"] for s in saved["slides_shown"]] == [2] and saved["now_showing"]["slide"] == 2
        assert client.post("/api/presentations/stop").json()["recording"] is True  # closing the deck: still recording
        assert client.get(f"/api/meetings/{meeting['id']}").json()["now_showing"] is None

        client.post(f"/api/meetings/{meeting['id']}/end")
        client.delete(f"/api/presentations/{deck['id']}")
