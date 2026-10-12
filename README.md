# LUBB AI 

Smart meeting system — نظام الاجتماعات الذكي

Wireless push-to-talk buttons + a local AI hub that transcribes each speaker,
summarises the meeting live, and writes the minutes at the end. Everything runs
on the hub — no cloud.

```
[Buttons ×20] ─► Hub: Device gateway (floor control) ─► Whisper (STT) ─► FastAPI + DB ─► WebSocket ─► Web app
                                                                  └─► Local LLM (Ollama) ─► summary / decisions / tasks
```

## Repository layout

```
docs/device-protocol.md   Hardware ↔ software contract (read this first, hardware team)
backend/                  Python / FastAPI hub
  app/main.py             App entry
  app/floor_control.py    Who may talk (free / one-at-a-time / queue)
  app/routers/devices.py  Button WebSocket: events in, LED commands out, audio → transcript
  app/routers/meetings.py Meeting REST API + dashboard WebSocket
  app/services/stt.py     Speech-to-text (stub or faster-whisper)
  app/services/llm.py     Minutes generation (stub or Ollama)
  tests/                  pytest
frontend/                 React + TypeScript + Vite + Tailwind
  src/pages/LiveMeeting   Live dashboard (speakers, transcript, summary/decisions/tasks)
  src/pages/Simulator     Phone/browser stand-in for a hardware button
  src/i18n/               Arabic (default, RTL) and English
  src/mocks/              Sample data used when no meeting is live
```

## Requirements

- Python 3.11+
- Node.js 20+ (`sudo apt install nodejs npm`, or https://nodejs.org)

## Run (development)

```bash
# Backend — http://localhost:8000  (API docs at /docs)
cd backend
python3 -m venv .venv          # Ubuntu may need: sudo apt install python3-venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000

# Frontend — http://localhost:5173
cd frontend
npm install
npm run dev
```

The dashboard shows sample data until a meeting is live. To try the full flow:

```bash
curl -X POST localhost:8000/api/meetings -H 'Content-Type: application/json' \
  -d '{"title":"تجربة","floor_mode":"one_at_a_time","participants":[
        {"name":"خالد","device_id":"btn-1","color":"#3b82f6"},
        {"name":"سعيد","device_id":"btn-2","color":"#22c55e"}]}'
curl -X POST localhost:8000/api/meetings/<id>/start
```

Then open `/simulator` in two tabs (btn-1, btn-2), hold the button and talk,
and watch the transcript appear on `/`. End with `POST /api/meetings/<id>/end`.

> Phones: the browser only allows microphone access over HTTPS (or localhost).
> For testing on phones over Wi-Fi, serve the frontend with HTTPS (e.g. `vite --https` with a local cert).

## Enabling local AI

By default STT and LLM are **stubs**, so the UI can be built without a GPU.

```bash
# Speech-to-text
.venv/bin/pip install faster-whisper numpy
STT_ENGINE=whisper WHISPER_MODEL=large-v3-turbo .venv/bin/uvicorn app.main:app --port 8000

# Minutes — install Ollama (https://ollama.com), then:
ollama pull qwen2.5:14b
LLM_ENGINE=ollama LLM_MODEL=qwen2.5:14b .venv/bin/uvicorn app.main:app --port 8000
```

Compare Arabic quality across models (Qwen, ALLaM, Jais…) on real recordings
before fixing the hub's hardware spec.

## Tests

```bash
cd backend && .venv/bin/python -m pytest
```

## Roadmap

- [x] Project structure, device protocol, floor control, live dashboard (mock data), simulator
- [ ] Meeting setup page (participants, button assignment, agenda, language)
- [ ] Minutes page: review, edit, approve, export PDF/Word
- [ ] Database (replace in-memory store)
- [ ] Rolling live summary during the meeting
- [ ] Chairman mode, speaking-time stats, meeting history & search
