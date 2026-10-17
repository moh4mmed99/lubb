"""Meeting report generation with an LLM served by Ollama (locally or on a remote GPU).

LLM_ENGINE=stub    -> placeholder report (no model needed)
LLM_ENGINE=ollama  -> calls OLLAMA_URL/api/chat with JSON output
"""

import json
import logging

from ..config import settings
from ..models import Decision, Meeting, Report, Task

log = logging.getLogger(__name__)

PROMPT = {
    "ar": "أنت سكرتير اجتماعات محترف. اكتب محضر الاجتماع باللغة العربية.",
    "en": "You are a professional meeting secretary. Write the meeting minutes in English.",
}

INSTRUCTIONS = """Return JSON only, with this shape:
{"summary": ["..."], "decisions": ["..."],
 "tasks": [{"text": "...", "owner": "<participant name or null>", "due_date": "YYYY-MM-DD or null"}]}"""


def _transcript(meeting: Meeting) -> str:
    names = {p.id: p.name for p in meeting.participants}
    return "\n".join(
        f"[{u.started_at:%H:%M:%S}] {names.get(u.participant_id, '?')}: {u.text}" for u in meeting.utterances
    )


async def generate_report(meeting: Meeting, language: str) -> Report:
    if settings.llm_engine == "stub":
        return Report(
            summary=[f"Stub report: {len(meeting.utterances)} utterances recorded."],
            language=language,
        )
    try:
        content = await _chat(
            [
                {"role": "system", "content": PROMPT[language] + "\n" + INSTRUCTIONS},
                {"role": "user", "content": f"Agenda: {meeting.agenda}\n\nTranscript:\n{_transcript(meeting)}"},
            ]
        )
    except Exception as exc:  # the secretary can still write the minutes by hand
        log.exception("Report generation failed")
        return Report(summary=[f"⚠ Report generation failed: {exc}"], language=language)
    return parse_report(content, meeting, language)


async def _chat(messages: list[dict]) -> str:
    """Streams the answer so a slow model never leaves the connection idle (tunnels time out at ~100 s)."""
    import httpx

    payload = {"model": settings.llm_model, "format": "json", "stream": True, "messages": messages}
    parts: list[str] = []
    timeout = httpx.Timeout(30, read=300)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST", f"{settings.ollama_url}/api/chat", json=payload, headers=settings.ai_headers
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.strip():
                    parts.append(json.loads(line).get("message", {}).get("content", ""))
    return "".join(parts)


def parse_report(content: str, meeting: Meeting, language: str) -> Report:
    """Turns the model's JSON into a Report, tolerating the usual small deviations."""
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        # Keep the raw text so nothing is lost; the secretary edits it on the report page.
        return Report(summary=[content.strip()] if content.strip() else [], language=language)
    if not isinstance(data, dict):
        data = {}

    def texts(items) -> list[str]:
        out = []
        for item in items if isinstance(items, list) else []:
            text = item.get("text") if isinstance(item, dict) else item
            if isinstance(text, str) and text.strip():
                out.append(text.strip())
        return out

    by_name = {p.name: p.id for p in meeting.participants}
    tasks = []
    for t in data.get("tasks") if isinstance(data.get("tasks"), list) else []:
        t = t if isinstance(t, dict) else {"text": t}
        if not isinstance(t.get("text"), str) or not t["text"].strip():
            continue
        due = t.get("due_date")
        tasks.append(
            Task(text=t["text"].strip(), owner_id=by_name.get(t.get("owner")), due_date=due if isinstance(due, str) else None)
        )
    return Report(
        summary=texts(data.get("summary")),
        decisions=[Decision(text=d) for d in texts(data.get("decisions"))],
        tasks=tasks,
        language=language,
    )
