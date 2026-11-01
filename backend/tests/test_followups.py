"""Following up earlier meetings' tasks in a new meeting."""

import io

from docx import Document
from fastapi.testclient import TestClient

from app.main import app


def _earlier_meeting(client) -> tuple[dict, dict]:
    """An ended meeting whose minutes have two tasks; returns it and its first task."""
    made = client.post(
        "/api/meetings/manual",
        json={
            "title": "اجتماع الشهر الماضي",
            "started_at": "2026-10-01T09:00:00",
            "ended_at": "2026-10-01T10:00:00",
            "participants": [{"name": "سالم", "is_chair": True}],
        },
    ).json()
    tasks = [{"text": "إعداد الميزانية", "owner_id": made["participants"][0]["id"], "due_date": "2026-10-15"}, {"text": "حجز القاعة"}]
    report = client.put(f"/api/meetings/{made['id']}/report", json={**made["report"], "tasks": tasks}).json()
    return made, report["tasks"][0]


def test_a_new_meeting_follows_up_earlier_tasks_and_ticks_them_off():
    with TestClient(app) as client:
        earlier, task = _earlier_meeting(client)
        ref = {"meeting_id": earlier["id"], "task_id": task["id"]}
        meeting = client.post(
            "/api/meetings",
            json={"title": "اجتماع المتابعة", "participants": [{"name": "سالم"}], "followups": [ref, ref]},  # once, however often picked
        ).json()
        assert meeting["followups"] == [
            {**ref, "text": "إعداد الميزانية", "owner": "سالم", "due_date": "2026-10-15", "meeting_title": "اجتماع الشهر الماضي", "done": False}
        ]

        # edited in the earlier minutes before the meeting ends: the follow-up keeps in step
        report = client.get(f"/api/meetings/{earlier['id']}").json()["report"]
        report["tasks"][0]["due_date"] = "2026-11-30"
        client.put(f"/api/meetings/{earlier['id']}/report", json=report)
        assert client.get(f"/api/meetings/{meeting['id']}").json()["followups"][0]["due_date"] == "2026-11-30"

        # ticked in the meeting: done in the earlier minutes too
        client.post(f"/api/meetings/{meeting['id']}/start")
        assert client.put(f"/api/meetings/{meeting['id']}/followups/{task['id']}", json={"done": True}).json()["done"] is True
        assert client.get(f"/api/meetings/{earlier['id']}").json()["report"]["tasks"][0]["done"] is True
        assert client.put(f"/api/meetings/{meeting['id']}/followups/nope", json={"done": True}).status_code == 404

        # once the meeting ends, its minutes keep the task as it stood then
        client.post(f"/api/meetings/{meeting['id']}/end")
        report = client.get(f"/api/meetings/{earlier['id']}").json()["report"]
        report["tasks"][0]["done"] = False
        client.put(f"/api/meetings/{earlier['id']}/report", json=report)
        assert client.get(f"/api/meetings/{meeting['id']}").json()["followups"][0]["done"] is True
        assert client.put(f"/api/meetings/{meeting['id']}/followups/{task['id']}", json={"done": False}).status_code == 409

        doc = Document(io.BytesIO(client.get(f"/api/meetings/{meeting['id']}/export/docx").content))
        assert "متابعة المهام السابقة" in "\n".join(p.text for p in doc.paragraphs)
        assert "اجتماع الشهر الماضي" in [c.text for t in doc.tables for row in t.rows for c in row.cells]

        client.delete(f"/api/meetings/{meeting['id']}")
        client.delete(f"/api/meetings/{earlier['id']}")


def test_a_task_that_no_longer_exists_cant_be_followed_up():
    with TestClient(app) as client:
        earlier, task = _earlier_meeting(client)
        client.delete(f"/api/meetings/{earlier['id']}")
        res = client.post(
            "/api/meetings",
            json={"title": "اجتماع", "participants": [{"name": "سالم"}], "followups": [{"meeting_id": earlier["id"], "task_id": task["id"]}]},
        )
        assert res.status_code == 422
