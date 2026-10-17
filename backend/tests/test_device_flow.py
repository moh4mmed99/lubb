import time

from fastapi.testclient import TestClient

from app.main import app
from app.models import Meeting
from app.store import Store, store


def _wait_for_report(client: TestClient, meeting_id: str) -> dict:
    for _ in range(50):
        meeting = client.get(f"/api/meetings/{meeting_id}").json()
        if meeting["report"] and not meeting["report_pending"]:
            return meeting
        time.sleep(0.05)
    raise AssertionError("report was not generated")


def test_button_turn_produces_utterance_on_dashboard():
    with TestClient(app) as client:
        meeting = client.post(
            "/api/meetings",
            json={"title": "Test", "participants": [{"name": "خالد", "device_id": "btn-1"}]},
        ).json()
        client.post(f"/api/meetings/{meeting['id']}/start")

        with client.websocket_connect("/api/meetings/ws") as dash, client.websocket_connect("/ws/device/btn-1") as btn:
            assert btn.receive_json() == {"type": "led", "state": "ready"}
            assert dash.receive_json()["type"] == "device_connected"
            assert client.get("/api/devices").json() == [{"device_id": "btn-1", "state": "ready", "battery": None}]

            btn.send_json({"type": "button_down"})
            assert btn.receive_json() == {"type": "led", "state": "talking"}
            btn.send_bytes(b"\x00\x00" * 16_000)  # 1 s of silence
            btn.send_json({"type": "button_up"})
            assert btn.receive_json() == {"type": "led", "state": "ready"}

            event = dash.receive_json()
            while event["type"] != "utterance":
                event = dash.receive_json()
            assert "1.0s" in event["utterance"]["text"]

        ended = client.post(f"/api/meetings/{meeting['id']}/end").json()
        assert ended["status"] == "ended"
        done = _wait_for_report(client, meeting["id"])
        assert len(done["utterances"]) == 1


def test_meetings_survive_a_restart():
    with TestClient(app) as client:
        meeting = client.post("/api/meetings", json={"title": "Persist", "participants": [{"name": "سعيد"}]}).json()
    reloaded = Store(store.db.execute("PRAGMA database_list").fetchone()[2])
    assert isinstance(reloaded.get(meeting["id"]), Meeting)


def test_only_one_live_meeting():
    with TestClient(app) as client:
        a = client.post("/api/meetings", json={"title": "A", "participants": [{"name": "x"}]}).json()
        b = client.post("/api/meetings", json={"title": "B", "participants": [{"name": "y"}]}).json()
        assert client.post(f"/api/meetings/{a['id']}/start").status_code == 200
        assert client.post(f"/api/meetings/{b['id']}/start").status_code == 409
        client.post(f"/api/meetings/{a['id']}/end")


def test_create_meeting_validates_input():
    with TestClient(app) as client:
        assert client.post("/api/meetings", json={"title": " ", "participants": [{"name": "x"}]}).status_code == 422
        assert client.post("/api/meetings", json={"title": "T", "participants": []}).status_code == 422
        dup = [{"name": "a", "device_id": "btn-1"}, {"name": "b", "device_id": "btn-1"}]
        assert client.post("/api/meetings", json={"title": "T", "participants": dup}).status_code == 422
