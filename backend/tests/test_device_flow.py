from fastapi.testclient import TestClient

from app.main import app


def test_button_turn_produces_utterance_on_dashboard():
    client = TestClient(app)
    meeting = client.post(
        "/api/meetings",
        json={"title": "Test", "participants": [{"name": "خالد", "device_id": "btn-1"}]},
    ).json()
    client.post(f"/api/meetings/{meeting['id']}/start")

    with client.websocket_connect("/api/meetings/ws") as dash, client.websocket_connect("/ws/device/btn-1") as btn:
        assert btn.receive_json() == {"type": "led", "state": "ready"}
        assert dash.receive_json()["type"] == "device_connected"

        btn.send_json({"type": "button_down"})
        assert btn.receive_json() == {"type": "led", "state": "talking"}
        btn.send_bytes(b"\x00\x00" * 16_000)  # 1 s of silence
        btn.send_json({"type": "button_up"})
        assert btn.receive_json() == {"type": "led", "state": "ready"}

        events = [dash.receive_json() for _ in range(3)]
        utterance = next(e for e in events if e["type"] == "utterance")["utterance"]
        assert "1.0s" in utterance["text"]

    ended = client.post(f"/api/meetings/{meeting['id']}/end").json()
    assert ended["status"] == "ended"
    assert ended["report"] is not None
