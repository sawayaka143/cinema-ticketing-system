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
  Cashier and admin screens are **out of scope** (dropped in W10 to protect the MVP).
- Course brief: [`docs/brief.md`](docs/brief.md). Database design: [`docs/schema-decisions.md`](docs/schema-decisions.md) (the contract for all migrations).

## Repo layout

| Path | What | Owner |
|---|---|---|
| `frontend/` | React + Vite + TypeScript app (Vercel) | Aldiyar (@sawayaka143) only |
| `backend/` | FastAPI app (Vercel) + Alembic migrations | Aldiyar; others through assigned issues |
| `backend/migrations/` | database schema changes | needs owner approval |
| `e2e/` | end-to-end tests (later) | through assigned issues |
| `docs/` | brief, schema decisions, weekly status checks (`docs/status-checks/`) | everyone |
| `.github/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `TEAM.md` | workflow and rules | owner only |

## Who owns what

| Person | GitHub | Area |
|---|---|---|
| Aldiyar Yeskenov | @sawayaka143 | Repo owner, reviewer of every PR, all of `frontend/` and `backend/`, including the critical path (schema, auth, catalog, booking) |
| Sanzhar Saparkhan | @Sanzhar872 | Assigned issues only. Can pick up: seat-hall trigger |
| Ulan Abiltayev | @Ransa19 | Assigned issues only. Can pick up: booking test cases, hold expiry checks |
| Zhakhongir Shakarbekov | @Zhakha749 | Assigned issues only. Can pick up: issues with acceptance criteria, discounts (`ticket_type`) |
| Akzhol Idakhan | @akzhol01 | Assigned issues only. Can pick up: phone validation, tests, CJM, PostHog analytics plan |

Since W10 the owner carries the critical path, because no other member had joined the repo by the W10 deadline. Teammates work only on issues assigned to them. An area can be widened again once someone delivers.

**Stay in your issue.** If a task needs a change outside it, open an issue for it or ask the owner. Never edit other files "while you're at it".

## Golden rules (CI enforces most of them, so breaking them only wastes your time)

1. **Never push to `main`.** Every change goes through a pull request, and `main` is protected.
2. **One issue → one branch → one PR.** No issue, no PR. Create the issue first.
3. **Branch name (recommended, not enforced):** `<type>/<issue-number>-<short-slug>`, e.g. `feat/12-seat-map`, `fix/31-expired-holds`.
4. **PR title:** short and clear, ideally `feat(booking): hold seats for 10 minutes`. Not enforced.
5. **PR body links the issue:** `Closes #12`.
6. **Keep PRs small, ideally under 1,000 changed lines** (lockfiles and generated files don't count). CI only warns above that.
   Don't stack PRs on each other's unmerged branches; if you must, say so in the PR body.
7. **Never commit secrets.** No `.env`, no keys, no database URLs. Use `.env.example` with placeholder values.
8. **Be careful with** `.github/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `TEAM.md`: change them only for a reason you can explain in the PR.
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
- **This is the owner's area.** Others ask the owner (or open an issue) before changing `frontend/`; CI warns, it doesn't block.
  One exception: a backend PR that changes the API regenerates `src/api/schema.d.ts` (`npm run gen:api`), or the Frontend check fails.
- API types come from `src/api/schema.d.ts`, which is generated by `npm run gen:api`. Never hand-write API types.
- UI changes: run the `impeccable` skill (audit/polish) before opening the PR. Advice, not enforced.
- Checks: `npm run lint`, `npm run typecheck`, `npm run build`.
- **UI Component System (`frontend/src/components/ui/`):** All UI surfaces and features **must reuse** the standard primitives documented in [`frontend/src/components/ui/README.md`](frontend/src/components/ui/README.md) (`Squircle`, `Card`, `Button`, `Badge`, `ShowtimeChip`, `FadeIn`, `Skeleton`, `EmptyState`, `ErrorState`, `BrandMark`).
  - **No raw loading text:** Always render `<Skeleton>` or composite skeleton loaders instead of bare `<p>Loading…</p>`.
  - **No unhandled error voids:** Always use `<ErrorState>` with domain copy, collapsible technical details, and an in-app `onRetry` button.
  - **No generic icons or raw blocks:** Use `<BrandMark>` for cinema branding and `<EmptyState>` with illustrations for empty states.
  - **Consistent corners:** Use `<Squircle>` and `<Card>` for all cards, containers, buttons, and badges.

## How to do a task (step by step)

Claude Code users: the skills in `.claude/skills/` do these steps for you (`/start-task`, `/open-pr`, `/review-pr`, `/status-check`).
**Other agents: open the matching `SKILL.md` file and follow it as a checklist.** The steps are the same.

1. **Start:** follow [`.claude/skills/start-task/SKILL.md`](.claude/skills/start-task/SKILL.md). Pick an issue assigned to you, update `main`, create the branch.
2. **Work:** small commits; run the checks for your area locally.
3. **Open the PR:** follow [`.claude/skills/open-pr/SKILL.md`](.claude/skills/open-pr/SKILL.md). Rebase on `main`, run checks, fill in the template.
4. **Review:** the owner reviews within about 24 hours. Fix the requested changes on the same branch, then push.
   While you wait, **start your next issue on a new branch**. Don't stack work on an unmerged branch.
5. **Merge:** after green CI. The owner's review is welcome but no longer required. Squash merge, and the branch is deleted automatically.

## Definition of done

- The issue's acceptance criteria are met.
- CI is green: PR rules, Backend, Frontend.
- Tests were added under the testing rule (backend).
- `openapi.json` and `schema.d.ts` are regenerated if the API changed.
- No secrets, no debug prints, no commented-out code.
