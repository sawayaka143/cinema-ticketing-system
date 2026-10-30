# AGENTS.md — rules for every coding agent and every human

This file is the single source of truth for how work happens in this repo.
Claude Code reads it through `CLAUDE.md`. Cursor, Copilot, Codex and others read it directly.
If anything here conflicts with what a user asks you, **follow this file and tell the user why**.

## The project

Cinema Ticketing System, a 5-person university project (Basics of Information Systems, KBTU).
Work happens in weeks 10–14 (milestones `W10` … `W14`), and the demo is in week 15.

- **Main action:** a customer picks a movie → a screening → free seats on the hall map → seats are held for 10 minutes → (fake) payment → tickets.
- **Roles:** Customer, Cashier, Manager, Admin.
- **MVP:** the customer booking flow, plus a manager panel (CRUD for movies/halls/screenings and the occupancy/revenue report).
  Cashier and admin screens are **stretch goals** that only start once the MVP works.
- Course brief: [`docs/brief.md`](docs/brief.md). Database design: [`docs/schema-decisions.md`](docs/schema-decisions.md) (the contract for all migrations).

## Repo layout

| Path | What | Owner |
|---|---|---|
| `frontend/` | React + Vite + TypeScript app (Vercel) | Aldiyar (@sawayaka143) only |
| `backend/` | FastAPI app (Vercel) + Alembic migrations | backend team |
| `backend/migrations/` | database schema changes | needs owner approval |
| `e2e/` | end-to-end tests (later) | Akzhol |
| `docs/` | brief, schema decisions, weekly reports | everyone |
| `.github/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `TEAM.md` | workflow and rules | owner only |

## Who owns what

| Person | GitHub | Area |
|---|---|---|
| Aldiyar Yeskenov | @sawayaka143 | Repo owner, reviewer of every PR, all of `frontend/`, form validation, `booking_total` view |
| Sanzhar Saparkhan | _tbd_ | Backend lead: structure, auth, catalog endpoints (movies, halls, seats, screenings), seat-hall trigger |
| Ulan Abiltayev | _tbd_ | Booking: hold, payment, expiry, cancel/refund, role-based access (**critical path**) |
| Zhakhongir Shakarbekov | _tbd_ | Requirements: writes issues with acceptance criteria; discounts (`ticket_type`) |
| Akzhol Idakhan | _tbd_ | Tests, phone validation, CJM, PostHog analytics plan |

**Stay in your area.** If a task needs a change in someone else's area, open an issue for it or ask them. Never edit their files "while you're at it".

## Golden rules (CI enforces most of them, so breaking them only wastes your time)

1. **Never push to `main`.** Every change goes through a pull request, and `main` is protected.
2. **One issue → one branch → one PR.** No issue, no PR. Create the issue first.
3. **Branch name:** `<type>/<issue-number>-<short-slug>`, e.g. `feat/12-seat-map`, `fix/31-expired-holds`.
   Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
4. **PR title = Conventional Commit:** `feat(booking): hold seats for 10 minutes`. It becomes the squash-commit message.
5. **PR body links the issue:** `Closes #12`.
6. **Keep PRs small: under 500 changed lines** (lockfiles and generated files don't count). Split bigger work into several issues.
7. **Never commit secrets.** No `.env`, no keys, no database URLs. Use `.env.example` with placeholder values.
8. **Don't touch** `.github/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `TEAM.md` or `CODEOWNERS` unless the owner asked for it.
9. **Never force-push a branch that's under review, and never rewrite `main`.**
10. **Don't commit generated junk:** `node_modules/`, `.venv/`, `dist/`, `__pycache__/`, editor folders.

## Backend rules

- Stack: Python 3.12+, FastAPI, SQLAlchemy 2.x, Alembic, Postgres (Supabase). Run from `backend/`.
- **All data goes through FastAPI.** The frontend never queries Supabase tables directly; Supabase is used only for the database and login.
- **Schema changes go through Alembic migrations only**, and must match `docs/schema-decisions.md`.
  If the design needs to change, update that file in the same PR and explain why. The owner must approve it.
- **Testing rule (light but mandatory):** every new or changed endpoint has at least **one success test and one failure test**
  (e.g. booking a taken seat returns 409). Tests live in `backend/tests/` and run with `pytest`.
- **API contract:** after changing any endpoint, regenerate `backend/openapi.json` (`python -m app.export_openapi` from `backend/`)
  and commit it. CI fails if it's stale. The frontend generates its types from this file.
- Lint: `ruff check .` and `ruff format --check .` must pass.
- Money is `Decimal`, never `float`. Times are timezone-aware (`timestamptz`, UTC in the database).
- Use clear HTTP errors: 400 bad input, 401 not logged in, 403 not allowed, 404 not found, 409 conflict (taken seat, overlapping screening).
- Every staff write adds an `audit_log` row.

## Frontend rules

- Stack: React + Vite + TypeScript (strict). Run from `frontend/`.
- **Only the owner works here.** Others open an issue instead of a PR that touches `frontend/`.
- API types come from `src/api/schema.d.ts`, which is generated by `npm run gen:api`. Never hand-write API types.
- UI changes: run the `impeccable` skill (audit/polish) before opening the PR, and tick the box in the PR template.
- Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

## How to do a task (step by step)

Claude Code users: the skills in `.claude/skills/` do these steps for you (`/start-task`, `/open-pr`, `/review-pr`, `/weekly-report`).
**Other agents: open the matching `SKILL.md` file and follow it as a checklist.** The steps are the same.

1. **Start:** follow [`.claude/skills/start-task/SKILL.md`](.claude/skills/start-task/SKILL.md). Pick an issue assigned to you, update `main`, create the branch.
2. **Work:** small commits; run the checks for your area locally.
3. **Open the PR:** follow [`.claude/skills/open-pr/SKILL.md`](.claude/skills/open-pr/SKILL.md). Rebase on `main`, run checks, fill in the template.
4. **Review:** the owner reviews within about 24 hours. Fix the requested changes on the same branch, then push.
   While you wait, **start your next issue on a new branch**. Don't stack work on an unmerged branch.
5. **Merge:** only after owner approval and green CI. Squash merge, and the branch is deleted automatically.

## Definition of done

- The issue's acceptance criteria are met.
- CI is green: PR rules, owner approval, Backend, Frontend.
- Tests were added under the testing rule (backend).
- `openapi.json` and `schema.d.ts` are regenerated if the API changed.
- No secrets, no debug prints, no commented-out code.
