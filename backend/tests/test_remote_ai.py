import asyncio
import json
from dataclasses import replace

import httpx

from app.models import Meeting, Participant
from app.services import llm, stt


def test_remote_stt_posts_pcm_with_token(monkeypatch):
    monkeypatch.setattr(stt, "settings", replace(stt.settings, stt_engine="remote", stt_url="https://gpu", ai_token="t0k"))
    seen = {}

    def fake_post(url, content, params, headers, timeout):
        seen.update(url=url, size=len(content), auth=headers["Authorization"])
        return httpx.Response(200, json={"text": "مرحبا", "language": "ar"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)
    assert stt.transcribe(b"\x00\x00" * 100) == ("مرحبا", "ar")
    assert seen == {"url": "https://gpu/transcribe", "size": 200, "auth": "Bearer t0k"}


def test_remote_llm_streams_and_parses(monkeypatch):
    answer = json.dumps({"summary": ["s"], "decisions": ["d"], "tasks": [{"text": "t", "owner": "خالد"}]})
    chunks = [answer[:10], answer[10:]]
    body = "".join(json.dumps({"message": {"content": c}, "done": False}) + "\n" for c in chunks)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer t0k"
        assert json.loads(request.content)["stream"] is True
        return httpx.Response(200, text=body)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(llm, "settings", replace(llm.settings, llm_engine="ollama", ollama_url="https://gpu", ai_token="t0k"))

    khalid = Participant(name="خالد")
    report = asyncio.run(llm.generate_report(Meeting(title="m", participants=[khalid]), "ar"))
    assert report.summary == ["s"]
    assert [d.text for d in report.decisions] == ["d"]
    assert report.tasks[0].owner_id == khalid.id


def test_parse_report_tolerates_bad_model_output():
    meeting = Meeting(title="m")
    assert llm.parse_report("not json", meeting, "en").summary == ["not json"]
    report = llm.parse_report(
        json.dumps({"summary": "oops", "decisions": [{"text": "d"}, None], "tasks": ["t", {"owner": "x"}]}), meeting, "en"
    )
    assert report.summary == []
    assert [d.text for d in report.decisions] == ["d"]
    assert [t.text for t in report.tasks] == ["t"]


def test_llm_failure_still_ends_with_a_report(monkeypatch):
    monkeypatch.setattr(llm, "settings", replace(llm.settings, llm_engine="ollama", ollama_url="http://127.0.0.1:9"))
    report = asyncio.run(llm.generate_report(Meeting(title="m"), "en"))
    assert report.summary[0].startswith("⚠ Report generation failed")
