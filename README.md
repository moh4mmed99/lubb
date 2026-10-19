# LUBB AI — لُبّ  · v1.3

Smart meeting system — نظام الاجتماعات الذكي

Each participant has a wireless push-to-talk button. A hub decides who may speak, turns each
turn into text with Whisper, shows the transcript live in a web app, and has an LLM write the
minutes (summary, decisions, tasks) when the meeting ends. Arabic is the default language;
English is fully supported.

```
[Buttons ×20] ─WebSocket─► Hub (FastAPI) ─► floor control ─► Whisper (STT) ─► SQLite
                                 │                                   │
                                 └──── live events (WebSocket) ◄─────┘
                                 │                                   └─► LLM (Ollama) ─► minutes
                                 ▼
                       Web app (Next.js) — dashboard, KPIs, setup, archive, minutes, tasks, presentations
```

Contents: [What's new in v1.3](#whats-new-in-v13) · [v1.2](#whats-new-in-v12) · [Getting started on Ubuntu](#getting-started-on-ubuntu) ·
[Getting started on macOS](#getting-started-on-macos) · [How it works](#how-it-works) ·
[Running the AI](#running-the-ai) · [Configuration](#configuration) · [Project layout](#project-layout) ·
[Working on the code](#working-on-the-code) · [Roadmap](#roadmap)

---

## What's new in v1.3

**Meeting features**
- **Agenda tracking:** the live page has an *Agenda* tab: the current item is highlighted, *Next item* moves on, and every turn is tagged with the item being discussed. The minutes show each item as *discussed / not discussed* with talk time, and the AI receives the transcript grouped by item.
- **Chairman mode (`chairman`):** pressing a button asks to speak (amber, in a queue). The chair gives or takes back the floor from the live page's *Floor control* panel; the speaker keeps it across presses. The chair's own button speaks straight away when the floor is free. No firmware change — see the speaking modes below.
- **Participant photos:** click (or drop an image on) a participant's circle in *New meeting*. Photos are cropped and shrunk in the browser (~10 KB) and saved with the meeting.
- **Stats tab:** talk time, contributions and speakers, plus bars per participant and per agenda item, live during the meeting.
- **Presenting doesn't pause recording:** while a deck is on screen, every turn is tagged with the slide shown, the meeting keeps a log of slides shown, and the AI sees `[On screen: …, slide N]` markers. The presenter rail shows *the meeting keeps recording*.

**New pages (right-side menu)**
- **KPIs:** computed from saved meetings — meetings this month, meeting hours, task completion, agenda coverage, meetings per month, task status.
- **Minutes (المحاضر):** every meeting the AI summarised, with **PDF** (browser print) and **Word** (`.docx`, right-to-left, letterhead from `ORG_NAME`) export.
- **Task follow-up (متابعة المهام):** every task from every meeting's minutes; overdue first; filter open / overdue / done; tick to complete.
- **Presentations (العروض التقديمية):** upload PowerPoint / Keynote / ODP / PDF (up to 200 MB). The hub converts slides **locally** with LibreOffice + poppler — nothing leaves the room. Decks show as card stacks; presenting is a card deck where *next* drops the top card away. Full screen for the room monitor.

**Archive & data**
- **Delete history:** a trash icon per meeting and a *Delete history* button (the live meeting is kept). A meeting deleted while its minutes are being written no longer comes back.

**Hub**
- **Mic master switch `MICS_ENABLED`:** off = every button stays muted and audio is dropped.
- **Local Whisper on the hub** (`STT_ENGINE=whisper`): tested on an NVIDIA DGX Spark (ARM); there the ready-made `faster-whisper` runs on the CPU, ~4 s for 5 s of speech.
- **Fix:** two connections for the same button (or a reconnect mid-turn) could leave the floor held forever. The hub now releases it, and closes the replaced connection with code **4001** so it doesn't reconnect and fight back.
- The browser button simulator was removed: testing now uses real buttons.

**Look & feel**
- **Framer Motion** (`motion`): sliding menu highlight and tab indicator, page entrances, spring press on buttons, lists that stagger in and glide when items leave. Respects *reduce motion*.
- **Intentional asymmetry:** pages anchor to the sidebar edge; a short heavy rule under every page title; one featured item per page (first KPI, latest minutes, newest deck); unequal splits; side rails on the presenter and the minutes document.
- **Softer corners**, **Lucide icons** in the menu and card headers, and a **text roll** on the لُبّ logo on hover (the whole word rolls; Arabic letters can't be split).
- **Dark mode swaps the sidebar:** black sidebar beside a light page in light mode, light sidebar beside a black page in dark mode (`--rail` / `--rail-fg` tokens).
- Tab title **لُبّ · LUBB**; the "hub is down" warning no longer flashes when switching pages.

**Tests:** 24 backend tests (adds agenda, chairman mode, stuck-button reconnect, mic switch, delete history, Word export, presentations and presenting-while-recording).

---

## What's new in v1.2

**Frontend rewritten in Next.js (plain JavaScript)**
- Vite + TypeScript replaced by Next.js 16 (App Router) + React 19 + Tailwind 4, in `.jsx`/`.js` files with no TypeScript.
- Same design, Arabic (RTL) / English and dark mode. The language is kept in a cookie, so the server renders the right direction from the first paint.
- Next.js proxies `/api` and `/ws` to the hub, so the browser (and phones on the same Wi-Fi) only talk to one address.
- The web app now runs on **http://localhost:3000** (was 5173).

**No more demo data: every page uses real meetings**
- **Live dashboard:** shows the meeting that is actually running, or an empty state with a link to start one. Each speaker shows their real button state, including *button offline*. The side panel shows the agenda and live speaking time. Transcription errors appear as a banner.
- **New meeting:** starts empty. It shows which buttons are connected right now, checks the form (title, at least one participant, no button used twice) and warns if another meeting is already live.
- **Archive:** lists real meetings with their status (live / writing minutes / draft / approved) and searches titles, names and transcripts.
- **Minutes page (`/meetings/<id>`):** waits while the AI writes and updates by itself when the minutes are ready. You can edit the summary, decisions and tasks (owner, due date), tick tasks done, approve, export a PDF, generate again, and delete the meeting.

**Backend**
- **SQLite storage** (`backend/data/lubb.db`) instead of memory: meetings survive restarts, and a meeting that was live when the hub stopped is still live after it restarts.
- **Ending a meeting returns straight away.** The minutes are written in the background, after any speech still being transcribed has been added. A `report_ready` event tells the web app.
- **Minutes can be generated again** (`POST /api/meetings/<id>/report/generate`), for example when the AI server was down.
- **Only one meeting can be live at a time.** Ended meetings can't be restarted, and input is validated.
- **`GET /api/devices`** returns each connected button's LED state and battery.
- **Transcription runs in the background,** so a button never freezes while Whisper works. The transcript stays in speaking order even when turns finish out of order.
- **Fixes:**
  - a button that disconnects mid-turn no longer loses what was said
  - a button that reconnects no longer kicks out its own new connection
  - a failed transcription no longer disconnects the button
- **More tolerant of bad LLM output:** messy JSON from the model no longer crashes report generation, and an unreachable AI server produces a report with a warning instead of an error.

**Remote AI on Google Colab**
- `colab/lubb_ai_colab.ipynb` runs Whisper and the LLM on Colab's free GPU behind a Cloudflare tunnel with a token. The hub needs no GPU.
- New settings: `STT_ENGINE=remote`, `STT_URL` and `AI_TOKEN`. LLM answers are streamed, because tunnels cut off requests that are silent for more than ~100 s.

**Tests:** 11 backend tests (floor control, the full button → transcript → minutes flow, persistence, validation, remote AI client).

---

## Getting started on Ubuntu

Tested commands for Ubuntu 22.04 / 24.04. You need **Python 3.11+** and **Node.js 20.9+**.

### 1. Install the tools

```bash
sudo apt update
sudo apt install -y git curl

# Presentations: the hub converts slides locally
sudo apt install -y libreoffice-impress poppler-utils

# Python — Ubuntu 24.04 ships 3.12:
sudo apt install -y python3 python3-venv python3-pip
python3 --version                     # must be 3.11 or newer

# Ubuntu 22.04 ships 3.10, which is too old. Install 3.12 instead:
#   sudo add-apt-repository -y ppa:deadsnakes/ppa
#   sudo apt install -y python3.12 python3.12-venv
#   …and use python3.12 instead of python3 below.

# Node.js — apt's version is too old for Next.js 16, so use NodeSource:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version                        # must be v20.9 or newer
```

### 2. Get the code

```bash
git clone https://github.com/moh4mmed99/lubb.git
cd lubb
```

### 3. Backend (the hub)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest                      # should print: 24 passed
uvicorn app.main:app --reload --port 8000
```

Leave it running. Check it at http://localhost:8000/api/health; the API docs are at http://localhost:8000/docs.

### 4. Web app (second terminal)

```bash
cd lubb/frontend
npm install
npm run dev
```

Open **http://localhost:3000**.

### 5. Try a meeting

1. **New meeting:** enter a title, add a participant on **btn-1**, then click **Start meeting**.
2. On the real button **btn-1**, hold to talk (it turns green), then release. The hub needs
   `MICS_ENABLED=true` in `backend/.env`; while it's `false`, every button stays muted.
3. The dashboard (`/`) shows what was said. With `STT_ENGINE=stub` it shows `[2.8s audio — transcription stub]`
   instead of words; see [Running the AI](#running-the-ai).
4. Click **End meeting**. The minutes page opens and fills in by itself.

---

## Getting started on macOS

Same as Ubuntu, with these differences:
- **Python:** the system Python is 3.9, which is too old. Install 3.12 with MacPorts (`sudo port install python312`) and use `/opt/local/bin/python3.12 -m venv .venv`. Homebrew or the python.org installer also work.
- **Node:** install from https://nodejs.org (v20.9 or newer).

---

## How it works

### The pieces

| Piece | Where | What it does |
|---|---|---|
| **Buttons** | hardware | Send `button_down` / `button_up` and, while allowed to talk, 16 kHz PCM audio. Show an LED colour from the hub. |
| **Hub** | `backend/` (Python, FastAPI) | Floor control, recording each turn, speech-to-text, storage, minutes, live events. |
| **AI** | stub, local GPU, or Google Colab | Whisper turns audio into text; an LLM served by Ollama writes the minutes. |
| **Web app** | `frontend/` (Next.js) | Dashboard, KPIs, setup, archive, minutes. Talks to the hub through the Next.js proxy. |

### A meeting, step by step

1. **Setup.** The web app sends `POST /api/meetings` with the title, agenda, language, speaking mode and participants (each linked to a button), then `POST /api/meetings/<id>/start`. The hub marks it live, creates a `FloorController` for the chosen mode and turns every button's LED **ready** (blue).
2. **Talking.** A button sends `button_down`. `floor_control.py` decides:
   - **talking** (green): stream audio now
   - **waiting** (amber): in the queue, in `queue` mode
   - **muted** (red): someone else has the floor, in `one_at_a_time` mode

   The hub sends the LED change to the buttons and a `speaker_state` event to every dashboard.
3. **A turn ends** on `button_up`. The hub frees the floor (handing it to the next person in `queue` mode) and starts transcribing the turn's audio in the background. When the text is ready, it is added to the meeting in speaking order, saved to SQLite and broadcast as an `utterance` event.
4. **Ending.** `POST /api/meetings/<id>/end` marks the meeting ended and mutes all buttons. In the background, the hub waits for pending transcriptions, asks the LLM for minutes (`services/llm.py`), saves them and broadcasts `report_ready`. While it works, the meeting has `report_pending: true`.
5. **Minutes.** The secretary reviews them on `/meetings/<id>`, edits them, and approves (`PUT /api/meetings/<id>/report`).

The button never decides on its own whether it may talk; all rules live in the hub. The full
button contract is in [docs/device-protocol.md](docs/device-protocol.md); read it before touching
the firmware.

### Speaking modes

| Mode | Behaviour |
|---|---|
| `free` | Up to 2 people may talk at once (`max_concurrent`). |
| `one_at_a_time` | One speaker; every other button turns red until the floor is free. |
| `queue` | Others wait (amber); the floor passes in the order people pressed. |
| `chairman` | Pressing asks to speak (amber, queued). The chair gives / takes back the floor from the dashboard; the speaker holds the button to talk and keeps the floor across presses. The chair's own button speaks at once when nobody has the floor. |

### REST API (`/api`)

| Method & path | Purpose |
|---|---|
| `GET /health` | Status, version and which AI engines are active |
| `GET /meetings` · `POST /meetings` | List (newest first) · create |
| `GET /meetings/{id}` · `DELETE /meetings/{id}` | One meeting · delete (not while live) |
| `POST /meetings/{id}/start` · `POST /meetings/{id}/end` | Start (409 if another is live) · end and write the minutes in the background |
| `POST /meetings/{id}/report/generate` | Write the minutes again |
| `PUT /meetings/{id}/report` | Save edited / approved minutes |
| `GET /devices` | Connected buttons with LED state and battery |
| `DELETE /meetings` | Delete history (every meeting except the live one) |
| `POST /meetings/{id}/agenda` | Move the live meeting to agenda item `{index}` |
| `GET /meetings/{id}/floor` | Who has the floor and who is waiting |
| `POST /meetings/{id}/floor/grant` · `revoke` · `dismiss` | Chairman mode: give the floor to `{device_id}` · take it back · drop a request |
| `GET /meetings/{id}/export/docx` | Minutes as a Word document |
| `GET /presentations` · `POST /presentations?name=…` | List · upload (raw file body) |
| `GET /presentations/{id}` · `DELETE /presentations/{id}` | One deck (status, slide count) · delete |
| `GET /presentations/{id}/slides/{n}.png` | Slide image |
| `POST /presentations/{id}/show` · `POST /presentations/stop` | Presenter is on slide `{slide}` (tags the live meeting) · closed the deck |

Interactive docs: http://localhost:8000/docs.

### WebSockets

- **`/ws/device/{device_id}`**: one per button (see `docs/device-protocol.md`).
- **`/api/meetings/ws`**: dashboards receive these events:
  - `utterance` (with `meeting_id`)
  - `speaker_state`
  - `device_connected` / `device_disconnected`
  - `battery`
  - `meeting_started` / `meeting_ended`
  - `report_ready`
  - `agenda` (current item changed)
  - `floor` (chairman mode: speaker and queue)
  - `slide` (slide on the room screen, or none)
  - `presentation_ready` (a deck finished converting, or failed)
  - `error` (transcription failures)

  The web app's `useHub()` hook reconnects automatically, and pages reload their data whenever the connection comes back.

### Data

Each meeting is stored as one JSON document in SQLite (`backend/data/lubb.db`, table `meetings`),
using the Pydantic models in `backend/app/models.py`:

- `Meeting`: title, agenda, agenda_index, language, floor_mode, status (`scheduled` / `live` / `ended`), participants, utterances, report, report_pending, now_showing, slides_shown, timestamps
- `Participant`: name, title, device_id, color, is_chair, photo (small JPEG data URL)
- `Utterance`: participant_id, start/end time, text, language, agenda_index, slide
- `Report`: summary, decisions, tasks (text, owner_id, due_date, done), language, approved

Storing a document per meeting means changing the model needs no database migration: add new
fields with a default value. Delete `lubb.db` to start fresh.

Presentations live next to the database, one folder each: `backend/data/presentations/<id>/`
(`meta.json`, the original file, `slides/1.png…`).

---

## Running the AI

By default both engines are **stubs**: transcripts show `[N s audio — transcription stub]` and the
minutes say `Stub report`. That's enough to work on the UI. For real AI, pick one option below.

### Option A: Google Colab (no GPU needed)

1. Open [colab/lubb_ai_colab.ipynb](colab/lubb_ai_colab.ipynb) in Google Colab (**File → Upload notebook**).
2. Choose **Runtime → Change runtime type → T4 GPU**, then **Runtime → Run all**. The first run takes 5–10 minutes.
3. The tunnel cell prints a settings block. Paste it into `backend/.env` (template: [backend/.env.example](backend/.env.example)).
4. Start the hub with it:
   ```bash
   cd backend && source .venv/bin/activate
   uvicorn app.main:app --env-file .env --reload --port 8000
   curl localhost:8000/api/health        # "stt":"remote","llm":"ollama"
   ```

The Colab URL and token change every session, so update `.env` each time. Colab also disconnects
idle or long sessions. In this mode audio and transcripts leave the hub, so use it for development
and demos, not confidential meetings. **Never commit `backend/.env`**; it is git-ignored.

[colab/server.py](colab/server.py) is the server that runs on Colab: `POST /transcribe` for Whisper,
and `POST /api/chat` forwarded to Ollama. The notebook contains a copy of it. If you change
`server.py`, update the `%%writefile server.py` cell in the notebook too.

### Option B: a local NVIDIA GPU (e.g. an Ubuntu laptop with CUDA)

```bash
# Speech-to-text (needs CUDA 12 + cuDNN 9; the pip packages below provide the libraries)
pip install faster-whisper numpy nvidia-cublas-cu12 nvidia-cudnn-cu12
STT_ENGINE=whisper WHISPER_MODEL=large-v3-turbo uvicorn app.main:app --port 8000

# Minutes — install Ollama (https://ollama.com), then:
ollama pull qwen2.5:14b               # 7b is lighter: qwen2.5:7b
LLM_ENGINE=ollama LLM_MODEL=qwen2.5:14b uvicorn app.main:app --port 8000
```

Without a GPU, use `WHISPER_MODEL=small` for CPU testing (slower and less accurate). Compare
Arabic quality across models (Qwen, ALLaM, Jais…) on real recordings before fixing the hub's
hardware spec.

---

## Configuration

All backend settings are environment variables (`backend/app/config.py`). Put them in
`backend/.env` and start with `--env-file .env`, or export them.

| Variable | Default | Meaning |
|---|---|---|
| `STT_ENGINE` | `stub` | `stub`, `whisper` (local) or `remote` (Colab) |
| `WHISPER_MODEL` | `large-v3-turbo` | faster-whisper model for `whisper` |
| `STT_URL` | — | Remote STT server, for `remote` |
| `LLM_ENGINE` | `stub` | `stub` or `ollama` |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama, local or the Colab URL |
| `LLM_MODEL` | `qwen2.5:14b` | Model used for the minutes |
| `AI_TOKEN` | — | Sent as `Authorization: Bearer …` to remote AI servers |
| `DB_PATH` | `data/lubb.db` | SQLite file, relative to where the hub starts |
| `DEFAULT_LANGUAGE` | `ar` | Default meeting language |
| `MICS_ENABLED` | `true` | Master switch for all buttons; `false` keeps them muted and drops audio |
| `ORG_NAME` | — | Letterhead printed at the top of exported (Word) minutes |

Frontend: `HUB_URL` (default `http://localhost:8000`) is where Next.js forwards `/api` and `/ws`.
`next.config.mjs` raises `experimental.proxyClientMaxBodySize` to 250 MB: by default Next.js cuts
forwarded uploads at 10 MB, which breaks large presentations.

---

## Project layout

```
docs/device-protocol.md      Hardware ↔ hub contract (read first if you work on buttons)
backend/                     Python / FastAPI hub
  app/main.py                App entry, /api/health
  app/config.py              Settings from environment variables
  app/models.py              Pydantic data model (Meeting, Participant, Utterance, Report…)
  app/store.py               SQLite storage
  app/state.py               Runtime state: current FloorController, pending transcriptions
  app/floor_control.py       Who may talk (free / one-at-a-time / queue), pure logic
  app/realtime.py            WebSocket registry: dashboards, devices, LED + battery state
  app/routers/devices.py     Button WebSocket: events in, LEDs out, audio → transcript
  app/routers/meetings.py    Meeting REST API, agenda, chairman floor control, Word export, dashboard WebSocket
  app/routers/presentations.py  Upload + local slide conversion, presenting (tags the live meeting)
  app/services/stt.py        Speech-to-text: stub / faster-whisper / remote
  app/services/llm.py        Minutes: stub / Ollama (streamed), tolerant JSON parsing; agenda + slide markers
  app/services/export.py     Minutes → Word (.docx), right-to-left for Arabic
  tests/                     pytest (conftest.py points the DB at a temp file)
  .env.example               Template for remote-AI settings
colab/
  lubb_ai_colab.ipynb        Notebook: Ollama + Whisper + Cloudflare tunnel on a Colab GPU
  server.py                  The GPU server the notebook runs
frontend/                    Next.js 16 (App Router) + React 19 + Tailwind 4, plain JavaScript
  app/layout.jsx             Root layout: fonts, language cookie → lang/dir, theme script
  app/globals.css            Design tokens (colours, soft corners, sidebar --rail colours that swap in dark mode)
  app/providers.jsx          i18next setup
  app/page.jsx               Live dashboard
  app/stage/page.jsx         Room screen: full-screen view for the meeting-room monitor
  app/kpis/page.jsx          KPIs across meetings
  app/setup/page.jsx         New meeting
  app/meetings/page.jsx      Archive + search
  app/meetings/[id]/page.jsx Minutes: view, edit, approve, export (PDF/Word), generate again, delete; details rail
  app/minutes/page.jsx       Every AI-summarised meeting, with PDF / Word export
  app/tasks/page.jsx         Task follow-up across all meetings
  app/presentations/page.jsx Presentation library (drop zone, card stacks)
  app/presentations/[id]/page.jsx  Presenter: dropping card deck, side rail, full screen
  components/AppShell.jsx    Navigation (sidebar, mobile bars); the room screen skips it
  components/Brand.jsx       The لُبّ wordmark
  components/RollingWordmark.jsx  The wordmark with the text roll on hover (sidebar)
  components/ChairPanel.jsx  Chairman mode: speaker + queue, give / take back the floor
  components/motion.jsx      Shared Framer Motion presets (ease, spring, Stagger / StaggerItem)
  components/ui.jsx          Card, Button, Badge, Avatar, PageHeader…
  components/MeetingStats.jsx, StatusBadge.jsx
  lib/api.js                 REST client + error messages
  lib/useHub.js              Live events WebSocket hook (auto-reconnect)
  lib/useLiveMeeting.js      The live meeting + button states, shared by the dashboard and room screen
  lib/format.js              Dates, durations, speaking time, colours, button list
  lib/kpis.js                KPI calculations
  lib/image.js               Participant photo helper
  lib/theme.js               Light/dark toggle
  i18n/ar.json, en.json      Translations (Arabic is the default)
  next.config.mjs            Proxy to the hub, allowed dev origins for phones
scripts/
  mic_test.sh                Records 5 s from the mic in LUBB's audio format and plays it back
```

---

## Working on the code

- **Tests:** `cd backend && python -m pytest`. Run them before every push. Add a test with every backend change; `tests/test_device_flow.py` shows how to drive buttons and dashboards with FastAPI's `TestClient`.
- **Frontend check:** `cd frontend && npm run build` must compile with no errors.
- **Translations:** every UI string lives in `frontend/i18n/ar.json` **and** `en.json`. Add new keys to both files.
- **Right-to-left:** use logical Tailwind classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), not `ml-`/`mr-`/`left-`/`right-`. Wrap user text in `<bdi>` or `dir="auto"`, because meetings mix Arabic and English.
- **Pages are client components** (`"use client"`) that fetch from `/api` and listen to `useHub()`. Follow the same pattern: load on connect, update from events.
- **Changing the data model:** edit `backend/app/models.py` and give new fields a default, so existing meetings in SQLite still load.
- **Changing the button protocol:** update `docs/device-protocol.md` and `routers/devices.py` together, and tell the hardware team.
- **Motion:** use the presets in `components/motion.jsx` (`spring`, `enter`, `Stagger` / `StaggerItem`) so everything moves the same way. `MotionConfig reducedMotion="user"` in `app/providers.jsx` respects *reduce motion*.
- **Layout rules (intentional asymmetry):** anchor page containers to the start edge (`me-auto`, not `mx-auto`); `PageHeader` draws the short heavy rule; give each page one featured item; prefer unequal splits (≈7:4) and side rails over 50/50 grids.
- **Arabic and motion:** never split Arabic words into per-letter animated pieces (the letters disconnect); animate whole words.
- **`frontend/AGENTS.md`** is written automatically by `next dev` for AI coding tools. Leave it.
- **Never commit** `backend/.env` (tokens), `backend/data/` (meeting recordings and text), `.venv/` or `node_modules/`. They are already git-ignored.

---

## Roadmap

- [x] Device protocol, floor control, live dashboard
- [x] Meeting setup (participants, button assignment, agenda, language)
- [x] Minutes: review, edit, approve, export PDF
- [x] Database (SQLite), meeting archive & search, speaking-time stats
- [x] Remote GPU option (Google Colab)
- [x] Export minutes to Word
- [x] Chairman mode (the chair grants/revokes the floor from the dashboard)
- [x] Agenda tracking, participant photos, live stats, KPIs from real meetings
- [x] Task follow-up across meetings
- [x] Presentations: local conversion, card-deck presenter, slides tagged in the meeting
- [ ] Rolling live summary during the meeting
- [ ] Room screen follows the presenter's slide (the hub already broadcasts `slide` events)
- [ ] Whisper on the GPU on ARM hubs (DGX Spark) — needs a CUDA build of CTranslate2
- [ ] Real button hardware (ESP32 or similar) speaking `docs/device-protocol.md`
- [ ] User accounts / access control for the web app
- [ ] Production deployment of the hub (systemd service, `npm run build && npm start`)
