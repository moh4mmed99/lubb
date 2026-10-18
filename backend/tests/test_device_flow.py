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


def test_agenda_moves_and_tags_utterances():
    with TestClient(app) as client:
        meeting = client.post(
            "/api/meetings",
            json={"title": "Agenda", "agenda": ["A", "B"], "participants": [{"name": "سعيد", "device_id": "btn-9"}]},
        ).json()
        assert client.post(f"/api/meetings/{meeting['id']}/agenda", json={"index": 1}).status_code == 409  # not live yet
        client.post(f"/api/meetings/{meeting['id']}/start")
        assert client.post(f"/api/meetings/{meeting['id']}/agenda", json={"index": 1}).json()["agenda_index"] == 1

        with client.websocket_connect("/api/meetings/ws") as dash, client.websocket_connect("/ws/device/btn-9") as btn:
            btn.receive_json()
            btn.send_json({"type": "button_down"})
            btn.receive_json()
            btn.send_bytes(b"\x00\x00" * 8_000)
            btn.send_json({"type": "button_up"})
            btn.receive_json()
            event = dash.receive_json()
            while event["type"] != "utterance":
                event = dash.receive_json()
            assert event["utterance"]["agenda_index"] == 1

        # clamped: past the last item means "all done"
        assert client.post(f"/api/meetings/{meeting['id']}/agenda", json={"index": 99}).json()["agenda_index"] == 2
        client.post(f"/api/meetings/{meeting['id']}/end")
        _wait_for_report(client, meeting["id"])


def test_reconnect_mid_turn_does_not_leave_button_stuck():
    """A second connection for the same button (e.g. a button rebooting mid-turn) must not leave the floor held."""
    from starlette.websockets import WebSocketDisconnect

    with TestClient(app) as client:
        meeting = client.post(
            "/api/meetings",
            json={"title": "Stuck", "floor_mode": "one_at_a_time", "participants": [{"name": "أنا", "device_id": "btn-7"}]},
        ).json()
        client.post(f"/api/meetings/{meeting['id']}/start")

        with client.websocket_connect("/ws/device/btn-7") as first:
            first.receive_json()
            first.send_json({"type": "button_down"})
            assert first.receive_json() == {"type": "led", "state": "talking"}

            with client.websocket_connect("/ws/device/btn-7") as second:
                # the old tab is told it was replaced, so it can stop reconnecting
                try:
                    while True:
                        first.receive_json()
                except WebSocketDisconnect as closed:
                    assert closed.code == 4001
                # the new connection starts ready and can take the floor
                msgs = [second.receive_json()]
                while msgs[-1] != {"type": "led", "state": "ready"}:
                    msgs.append(second.receive_json())
                second.send_json({"type": "button_down"})
                assert second.receive_json() == {"type": "led", "state": "talking"}
                second.send_json({"type": "button_up"})
                second.receive_json()

        client.post(f"/api/meetings/{meeting['id']}/end")
        _wait_for_report(client, meeting["id"])


def test_mics_switched_off_keeps_buttons_muted(monkeypatch):
    import dataclasses

    from app.config import settings
    from app.routers import devices

    monkeypatch.setattr(devices, "settings", dataclasses.replace(settings, mics_enabled=False))
    with TestClient(app) as client:
        meeting = client.post("/api/meetings", json={"title": "Off", "participants": [{"name": "أنا", "device_id": "btn-8"}]}).json()
        client.post(f"/api/meetings/{meeting['id']}/start")
        with client.websocket_connect("/ws/device/btn-8") as btn:
            assert btn.receive_json() == {"type": "led", "state": "muted"}
            btn.send_json({"type": "button_down"})
            btn.send_bytes(b"\x00\x00" * 16_000)
            btn.send_json({"type": "button_up"})
            btn.send_json({"type": "battery", "level": 50})  # round-trip marker: nothing above was answered
        assert client.get(f"/api/meetings/{meeting['id']}").json()["utterances"] == []
        client.post(f"/api/meetings/{meeting['id']}/end")
        _wait_for_report(client, meeting["id"])


def test_delete_history_keeps_the_live_meeting():
    with TestClient(app) as client:
        for m in client.get("/api/meetings").json():  # start from a clean slate
            if m["status"] == "live":
                client.post(f"/api/meetings/{m['id']}/end")
        old = client.post("/api/meetings", json={"title": "Old", "participants": [{"name": "x"}]}).json()
        live = client.post("/api/meetings", json={"title": "Now", "participants": [{"name": "y"}]}).json()
        client.post(f"/api/meetings/{live['id']}/start")

        assert client.delete("/api/meetings").json()["deleted"] >= 1
        remaining = [m["id"] for m in client.get("/api/meetings").json()]
        assert remaining == [live["id"]]
        assert client.get(f"/api/meetings/{old['id']}").status_code == 404
        client.post(f"/api/meetings/{live['id']}/end")
        _wait_for_report(client, live["id"])


def test_deleted_meeting_is_not_resurrected_by_a_late_save():
    with TestClient(app) as client:
        m = client.post("/api/meetings", json={"title": "Gone", "participants": [{"name": "x"}]}).json()
        meeting = store.get(m["id"])
        client.delete(f"/api/meetings/{m['id']}")
        store.save(meeting)  # what a finishing report task does
        assert client.get(f"/api/meetings/{m['id']}").status_code == 404
        assert Store(store.db.execute("PRAGMA database_list").fetchone()[2]).get(m["id"]) is None
