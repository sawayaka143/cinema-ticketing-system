# Cinema Ticketing System

Book cinema tickets online: pick a movie, a screening and seats on the hall map, hold them for 10 minutes, pay, get tickets.
Managers run movies, halls, screenings and an occupancy/revenue report.

KBTU, Basics of Information Systems, team project.

| Part | Stack | Folder |
|---|---|---|
| Web app | React + Vite + TypeScript | [`frontend/`](frontend) |
| API | FastAPI + SQLAlchemy + Alembic | [`backend/`](backend) |
| Database & login | Supabase (Postgres + Auth) | — |
| Hosting | Vercel (two projects) | — |

**Start here:** [`TEAM.md`](TEAM.md) (how we work) → [`AGENTS.md`](AGENTS.md) (rules, who owns what) → [`docs/schema-decisions.md`](docs/schema-decisions.md) (database).

## Run locally

Backend (Python 3.12+), with `backend/.env` filled from `.env.example` (dev database only):

```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate   # macOS/Linux: . .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Frontend (Node 22+), with `frontend/.env.local` filled from `.env.example`:

```bash
cd frontend
npm install
npm run dev
```
