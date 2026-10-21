from fastapi.testclient import TestClient

from app.main import app


def test_manual_minutes_are_an_ended_meeting_with_editable_minutes():
    with TestClient(app) as client:
        made = client.post(
            "/api/meetings/manual",
            json={
                "title": "اجتماع اللجنة",
                "started_at": "2026-10-19T09:00:00",
                "ended_at": "2026-10-19T10:30:00",
                "agenda": ["الميزانية", " "],
                "participants": [{"name": "سالم", "title": "رئيس اللجنة", "is_chair": True}, {"name": ""}],
            },
        ).json()
        assert made["status"] == "ended" and made["manual"] is True
        assert made["agenda"] == ["الميزانية"] and [p["name"] for p in made["participants"]] == ["سالم"]
        assert made["report"]["summary"] == [] and made["report"]["approved"] is False

        # the minutes are written by hand through the usual report endpoint
        report = {**made["report"], "summary": ["أُقرّت الميزانية"], "tasks": [{"text": "إرسال التقرير", "owner_id": made["participants"][0]["id"]}]}
        saved = client.put(f"/api/meetings/{made['id']}/report", json=report).json()
        assert saved["summary"] == ["أُقرّت الميزانية"] and saved["tasks"][0]["text"] == "إرسال التقرير"

        # no recording, so the AI can't rewrite them
        assert client.post(f"/api/meetings/{made['id']}/report/generate").status_code == 409
        assert client.get(f"/api/meetings/{made['id']}/export/docx").status_code == 200
        client.delete(f"/api/meetings/{made['id']}")


def test_manual_minutes_validate_title_and_times():
    with TestClient(app) as client:
        base = {"started_at": "2026-10-19T10:00:00", "ended_at": "2026-10-19T09:00:00"}
        assert client.post("/api/meetings/manual", json={**base, "title": " "}).status_code == 422
        assert client.post("/api/meetings/manual", json={**base, "title": "x"}).status_code == 422
