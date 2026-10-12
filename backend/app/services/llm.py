"""Meeting report generation with a local LLM (served by Ollama).

LLM_ENGINE=stub    -> placeholder report (no model needed)
LLM_ENGINE=ollama  -> calls Ollama's /api/chat with JSON output
"""

import json

from ..config import settings
from ..models import Decision, Meeting, Report, Task

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

    import httpx

    payload = {
        "model": settings.llm_model,
        "format": "json",
        "stream": False,
        "messages": [
            {"role": "system", "content": PROMPT[language] + "\n" + INSTRUCTIONS},
            {"role": "user", "content": f"Agenda: {meeting.agenda}\n\nTranscript:\n{_transcript(meeting)}"},
        ],
    }
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(f"{settings.ollama_url}/api/chat", json=payload)
        resp.raise_for_status()
    data = json.loads(resp.json()["message"]["content"])

    by_name = {p.name: p.id for p in meeting.participants}
    return Report(
        summary=data.get("summary", []),
        decisions=[Decision(text=d) for d in data.get("decisions", [])],
        tasks=[
            Task(text=t["text"], owner_id=by_name.get(t.get("owner")), due_date=t.get("due_date"))
            for t in data.get("tasks", [])
        ],
        language=language,
    )
