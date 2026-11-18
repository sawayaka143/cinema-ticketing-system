# Week 12 status check (2026-11-14 – 2026-11-20)

Covers Weeks 11 and 12 since [`week-10.md`](week-10.md).

## Team report

| | |
|---|---|
| Stage | **Working system.** The full MVP — customer booking flow (catalog, 3D hall view, 10-minute seat hold, card & demo Kaspi QR payment, QR tickets, My bookings) and manager panel (occupancy/revenue report, schedule/movies/halls CRUD, box-office check-in & refund) — is built and deployed. |
| Status | **On Track** for the W13 feature freeze technically; **3 teammates** still have no recorded contribution. |
| Milestone W12 | **13+ issues closed** (and W11 **52/52 closed**). |
| Main process | movie → screening → 3D/2D seat map → 10-min hold → card / demo Kaspi QR payment → QR tickets + manager report/schedule/movies/halls: **all steps work end to end**. |

**What changed since Week 10**
- **Customer booking flow completed (W11–W12):** UI component library & obsidian dark theme (`#84`–`#94`), one-request program view & local SVG posters (`#77`, `#89`, `#96`, `#98`), confirmed test user seed script (`#87`), fake Kaspi QR invoice/pay flow (`#100`, `#102`), IMAX 126-seat hall relayout (`#107`), 3D hall seat picker with first-person screen POV (`#108`), and Kaspi error/hit-target fixes (`#111`).
- **Manager & Box Office UI completed (W12):** `/manager` panel with 7-day occupancy/revenue report, schedule CRUD, movies CRUD/archive, halls & layout management, plus QR check-in and booking refund (`#112`, `#114`).
- **Team onboarding:** `@Sanzhar872` joined the codebase and shipped backend and frontend features (`#100`, `#102`, `#107`, `#108`). `@Ransa19` accepted collaborator access, while `@Zhakha749` and `@akzhol01` invitations from `2026-11-04` remain unaccepted.

**Demo**
1. **What's on & 3D seat booking:** `/` → `/movies/:id` → `/screenings/:id` (126-seat IMAX 3D view with seat POV, VIP/wheelchair seats, student/child discounts) → `/bookings/:id` (10-minute countdown, demo Kaspi QR `/fake-kaspi/:token` or card pay, downloadable QR ticket) → `/me/bookings`.
2. **Manager panel:** `/manager` (staff role required) → 7-day occupancy report (`<30%` / `>90%` action badges), Schedule CRUD (overlap protection), Movies CRUD/archive, Halls & seat grid layout, and Box office check-in/refund.
3. **Production:** https://cinema-api-gold.vercel.app (`/api/health`) and deployed frontend.

**Current difficulty and team decision**
- **Difficulty:** Only 2 of 5 members have shipped work so far, leaving QA/E2E tests (`e2e/`) and analytics/test-case verification behind schedule.
- **Decision:** Lock feature changes by W13 (2026-11-27) and dedicate W13–W14 to E2E smoke tests, edge-case hardening, and final demo rehearsal.

**Next team milestone:** **W13 (due 2026-11-27) — feature freeze:** Playwright E2E coverage for `BOOK-01`–`BOOK-05` and manager report verification, zero open MVP bugs.

## Individual reports

### Aldiyar Yeskenov (@sawayaka143) — repo owner, backend, frontend
- **Completed (W11–W12):** Customer catalog & UI primitives (`#77`, `#84`–`#98`), confirmed test user seeder (`#87`), booking UI polish (`#111`), Manager & Box Office panel (`#112`, `#114`), PR reviews and merges for `#100`, `#102`, `#107`, `#108`.
- **Evidence:** Merged PRs `#77`, `#84`–`#98`, `#104`, `#111`, `#112`, `#114` on `main`.
- **Last week's task:** Done (customer booking flow + manager UI shipped).
- **Difficulty:** Carrying architecture, reviews, deployment, and missing teammate capacity.
- **Next task (due 2026-11-27):** Ensure manager staff accounts + dev/prod keep-alive secrets are configured and verify full E2E booking + manager flow before feature freeze.

### Sanzhar Saparkhan (@Sanzhar872) — backend and frontend
- **Completed (W11–W12):** Demo Kaspi QR payment backend & frontend (`#100`, `#102`), IMAX 126-seat hall layout & `--relayout` (`#107`), and Three.js 3D hall seat picker (`#108`).
- **Evidence:** Merged PRs `#100` (+861/−5), `#102` (+1816/−23), `#107` (+231/−26), `#108` (+1111/−9).
- **Next task (due 2026-11-27):** Verify and test customer mobile + desktop 3D hall view and Kaspi QR flows end-to-end; fix any visual or responsive edge cases before feature freeze.

### Ulan Abiltayev (@Ransa19) — booking tests
- **Completed:** No evidence (no commits or PRs in repo; accepted collaborator invite).
- **Next task (due 2026-11-27):** Execute and document manual/E2E results for `BOOK-01`–`BOOK-05` in [`docs/test-cases.md`](../test-cases.md) with PR evidence.

### Zhakhongir Shakarbekov (@Zhakha749) — requirements, discounts
- **Completed:** No evidence (pending GitHub collaborator invite from `2026-11-04`).
- **Next task (due 2026-11-27):** Accept collaborator invite and verify discount & cleaning-buffer decisions in [`docs/schema-decisions.md`](../schema-decisions.md) §9 via PR.

### Akzhol Idakhan (@akzhol01) — tests, phone validation
- **Completed:** No evidence (pending GitHub collaborator invite from `2026-11-04`).
- **Next task (due 2026-11-27):** Accept collaborator invite and submit a PR with additional edge-case tests in `backend/tests/` or `e2e/`.

## Next tasks

| Who | Task | Deadline | How we check it |
|---|---|---|---|
| Aldiyar | E2E smoke test (`e2e/`) + production manager role & keep-alive check | 2026-11-27 | Green CI + Playwright run on customer & manager flow |
| Sanzhar | 3D hall view & Kaspi QR regression/mobile QA | 2026-11-27 | Merged fix PR or recorded QA pass on desktop & mobile |
| Ulan | Run and update `BOOK-01`–`BOOK-05` verification | 2026-11-27 | Merged PR updating `docs/test-cases.md` |
| Zhakhongir | Finalize `schema-decisions.md` §9 open questions | 2026-11-27 | Merged PR resolving §9 |
| Akzhol | Add `e2e/` or booking edge-case tests | 2026-11-27 | Merged test PR with green CI |

## Ready? (check before class)
- [x] We can show a new result, not only talk about it (3D hall view booking, demo Kaspi QR payment, and full Manager Panel on live seeded data)
- [x] Every member has evidence or is honestly marked "No evidence"
- [x] Every member has one measurable task with an owner, deadline and checkable result
