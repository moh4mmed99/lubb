"""Meeting recordings: every transcribed turn is kept, and the meeting can be listened to from the archive."""

import io
import time
import wave

from fastapi.testclient import TestClient

from app.main import app
from app.services import recordings


def _turn(btn, seconds: float) -> None:
    btn.send_json({"type": "button_down"})
    assert btn.receive_json() == {"type": "led", "state": "talking"}
    btn.send_bytes(b"\x10\x00" * int(16_000 * seconds))
    btn.send_json({"type": "button_up"})
    assert btn.receive_json() == {"type": "led", "state": "ready"}


def test_turns_are_recorded_and_played_back_as_one_meeting():
    with TestClient(app) as client:
        meeting = client.post(
            "/api/meetings", json={"title": "تسجيل", "participants": [{"name": "مريم", "device_id": "btn-7"}]}
        ).json()
        assert client.get(f"/api/meetings/{meeting['id']}/audio").status_code == 404  # nothing said yet
        client.post(f"/api/meetings/{meeting['id']}/start")
        with client.websocket_connect("/ws/device/btn-7") as btn:
            assert btn.receive_json()["state"] == "ready"
            _turn(btn, 1)
            _turn(btn, 2)
        for _ in range(50):
            utterances = client.get(f"/api/meetings/{meeting['id']}").json()["utterances"]
            if len(utterances) == 2:
                break
            time.sleep(0.05)
        assert [u["audio"] for u in utterances] == [True, True]

        audio = client.get(f"/api/meetings/{meeting['id']}/audio")
        assert audio.status_code == 200 and audio.headers["content-type"] == "audio/wav"
        with wave.open(io.BytesIO(audio.content)) as w:
            assert (w.getframerate(), w.getnchannels()) == (16_000, 1)
            assert w.getnframes() == 16_000 * 3 + int(recordings.GAP * 16_000)  # both turns, a pause between
        assert client.get(f"/api/meetings/{meeting['id']}/audio", headers={"Range": "bytes=0-99"}).status_code == 206

        client.post(f"/api/meetings/{meeting['id']}/end")
        assert recordings._folder(meeting["id"]).exists()
        assert client.delete(f"/api/meetings/{meeting['id']}").status_code == 204
        assert not recordings._folder(meeting["id"]).exists()  # deleting a meeting deletes its recording
