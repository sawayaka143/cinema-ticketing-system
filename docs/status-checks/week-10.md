# Week 10 status check (2026-10-31 – 2026-11-06)

First check. "Since the last check" means since the Week 9 database task (Task 09).

## Team report

| | |
|---|---|
| Stage | **Started.** Design, data model, CI and deployment exist; no step of the main process works yet |
| Status | **At Risk** (details below) |
| Milestone W10 | 7/13 issues closed. All 6 open ones are backend critical path (#9–#13) or the frontend shell (#14) |
| Main process | movie → screening → seats → hold → pay → tickets: **none of the steps works yet** |

**What changed since Task 09**
- The Task 09 design was reviewed question by question and fixed in [`schema-decisions.md`](../schema-decisions.md): staff roles, ticket types, the hold → pay booking flow with 10-minute expiry, the audit log, row-level security.
- The repo, workflow rules, CI (lint, migrations up/down/up, tests, API contract check, PR rules) and the Vercel deployment for frontend and backend are set up.
- The production frontend shows a placeholder page in the real app's style (#18). The production API answers `GET /health`.

**Demo**
1. The production frontend (Vercel project `cinema-web`).
2. The production API: `GET /health` and the interactive docs at `/docs` (Vercel project `cinema-api`).
3. CI: a PR with a wrong branch name or no linked issue is rejected by the "PR rules" check.
4. The data model: [`schema-decisions.md`](../schema-decisions.md) and the ERD ([`task09-erd.png`](../task09-erd.png)).

**Status: At Risk**
- **Cause:** one person is doing the work of five. Collaborator invitations went out on 2026-11-04 (Sanzhar 10:29 UTC; Ulan, Zhakhongir and Akzhol 19:23 UTC). As of 2026-11-05, none of them was accepted, so no other member has a commit, issue, PR or review.
- **Impact:** the backend critical path (migrations, auth, catalog) has not started, so booking work in W11 can't start either. The MVP is at risk by the W13 feature freeze.
- **Response:** the owner takes all W10 issues (#9–#13) now. Cashier and admin screens are dropped from scope. Each teammate gets one W11 task off the critical path. A task with no branch by **2026-11-08 20:00** goes back to the owner or is dropped.
- **Responsible:** Aldiyar Yeskenov.

**Team decision this week:** keep the scope to the MVP: the customer booking flow and the manager panel (movie/hall/screening CRUD plus the occupancy and revenue report). Cashier and admin screens are out.

**Next team milestone:** W11 (due 2026-11-13). The first migration, seed data and catalog endpoints are live, and the frontend shows real movies and screenings.

## Individual reports

### Aldiyar Yeskenov (@sawayaka143): repo owner, frontend, and now backend
- **Completed:**
  - Task 09 document: table plan, ERD, business query, booking transaction, roles and access.
  - The schema review in `schema-decisions.md`.
  - Project setup: workflow rules, CI, deployment, starter apps.
  - PRs #2, #4, #6 (deploy and CI fixes, 2026-10-30), #8 (CI cleanup, +237/−110), #16 (Supabase keep-alive, +34), #18 (placeholder front-end, +211/−13).
- **Evidence:** the merged PRs above and every commit on `main`.
- **Difficulty:** carrying the whole project alone.
- **Next task (due 2026-11-13):**
  - #9 first migration (users and catalog tables)
  - #13 seed data
  - #12 catalog read endpoints
  - #14 frontend shell showing real data
  - #10 and #11 if time allows

### Sanzhar Saparkhan (@Sanzhar872): backend
- **Completed:** No evidence. The invitation is not accepted.
- **Next task (due 2026-11-13):** seat-hall trigger migration (`seat.hall_id = screening.hall_id`). Checkable result: the migration plus a test showing that a ticket for a seat from another hall is rejected.

### Ulan Abiltayev (@Ransa19): booking
- **Completed:** No evidence. The invitation is not accepted.
- **Next task (due 2026-11-13):** the booking section of `docs/test-cases.md`: 5 hold, payment and expiry cases. Checkable result: the file is merged, and each case has steps and an expected result.

### Zhakhongir Shakarbekov (@Zhakha749): requirements, discounts
- **Completed:** No evidence. The invitation is not accepted.
- **Next task (due 2026-11-13):** `ticket_type` discounts. Checkable result: an issue in W11 with acceptance criteria and price rules that the owner agrees to.

### Akzhol Idakhan (@akzhol01): tests, phone validation
- **Completed:** No evidence. The invitation is not accepted.
- **Next task (due 2026-11-13):** phone format validation (`+7XXXXXXXXXX`) in the backend. Checkable result: a merged PR where a wrong format returns 400, with a success test and a failure test.

## Next tasks

| Who | Task | Deadline | How we check it |
|---|---|---|---|
| Aldiyar | #9 first migration, #13 seed data | 2026-11-13 | `alembic upgrade head` works on dev; the seeded halls have seats |
| Aldiyar | #12 catalog endpoints, #14 frontend shell | 2026-11-13 | The deployed site lists real movies and screenings |
| Sanzhar | Seat-hall trigger | 2026-11-13 | A test inserts a wrong-hall ticket and it fails |
| Ulan | Booking test cases | 2026-11-13 | `docs/test-cases.md` is merged with 5 cases |
| Zhakhongir | Discount rules issue | 2026-11-13 | The issue has acceptance criteria and is agreed |
| Akzhol | Phone validation | 2026-11-13 | A wrong format returns 400; tests pass |

Teammate tasks are assigned as soon as the person accepts the invitation. With no branch by 2026-11-08 20:00, the task goes back to the owner or is dropped.

## Stale issues (3-day rule)

None. Only the owner can be assigned issues so far.

## Ready? (check before class)
- [x] We can show a new result, not only talk about it (deployed app, API, CI, data model)
- [x] Every member has evidence or is honestly marked "No evidence"
- [x] Every member has one measurable task with an owner, deadline and checkable result
