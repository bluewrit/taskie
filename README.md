# ✅ Taskie — Agentic Task Management System

A full-stack task management system with **file upload & preview for every file type** and an
**agentic AI layer** that recommends, plans, and evaluates your work — **Python (FastAPI)** backend,
**React (Vite)** frontend.

## Features

### 🗂 Task management
- Projects + tasks with status (to do / in progress / blocked / done), priority, due dates,
  estimates, progress, and tags
- Kanban board with drag & drop, sortable/filterable list view, dashboard overview
- Every task carries an **agent priority score** (0–100) computed from due-date pressure,
  priority, momentum, and estimate size

### 📎 Upload & preview — any file type
- Drag-drop or click upload (progress bar), download, delete
- **Inline previews**:
  | Type | Preview |
  |---|---|
  | Images (png/jpg/gif/webp/svg…) | native `<img>` |
  | PDF | embedded viewer + extracted text |
  | Video / audio (mp4, webm, mp3, wav…) | streaming player with HTTP Range support (seeking works) |
  | CSV / TSV | rendered table |
  | XLSX | per-sheet tables |
  | DOCX / PPTX | extracted document text |
  | Code, markdown, JSON, YAML, logs… | syntax-labelled text view |
  | ZIP | archive entry listing |
  | Anything else | safe download fallback |

### 🤖 Agentic AI
- **Agent chat** — natural language → real actions ("add task Fix login bug due tomorrow high
  priority", "complete #3", "what should I do next?"). Runs a perceive → reason → act → reflect
  loop over a tool registry, with a visible reasoning trace and action log.
- **Recommendation system** — continuous analysis producing ranked advice: overdue alerts,
  at-risk tasks, quick wins, stalled-WIP detection, priority realignment, hygiene nudges;
  one-click **auto-apply** lets the agent execute the safe fixes itself.
- **Planner** — auto-schedules the whole backlog into day-by-day focus blocks respecting due
  dates, agent scores, and configurable daily capacity.
- **Evaluation** — completion rate, on-time rate, cycle time, throughput trend, backlog health,
  per-project breakdown, an A–F grade, and written coaching feedback.
- **LLM-ready**: works fully offline with the built-in engine; set `OPENAI_API_KEY`
  (+ optional `OPENAI_BASE_URL`, `OPENAI_MODEL`) to upgrade the chat to an LLM with
  function calling over the same tools.

## Run it

```bash
# Backend (port 8000)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m app.seed          # optional demo data (--force to reset)
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend (port 5173, proxies /api → :8000)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```

## Tech

| Layer | Stack |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2 (SQLite), python-docx / openpyxl / python-pptx / pypdf |
| Frontend | React 18, Vite 5, hand-rolled SVG charts, zero UI framework |
| AI | Deterministic agent engine (NLU + tool-calling loop) with optional OpenAI-compatible LLM |
