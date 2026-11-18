# Final defence: answers

The 9 questions from the course handout. These are draft answers: keep them true for **today**. The `status-check` skill refreshes them every week.
Last updated: Week 12 (2026-11-19).

## 1. What real problem does the system solve?
Buying cinema tickets without queueing at the box office or calling the cinema, and without two people ending up with the same seat. The cinema gets the same thing in reverse: no lost sales on seats that look taken but were never paid for, and a clear view of which shows are empty and which are full.

## 2. Who needs it and why?
- **Customers:** see free seats on the hall map and pay online in a few minutes.
- **Managers:** run the schedule (movies, halls, screenings, prices) and see occupancy and revenue per screening for the next 7 days, so they can move or cancel shows below 30 % and add shows above 90 %.

## 3. What works now? Show it.
_Week 12:_ the full MVP is live on Vercel and locally:
- **Customer flow:** movie program (`/`), movie details (`/movies/:id`), 126-seat IMAX 3D seat map with first-person screen preview (`/screenings/:id`), 10-minute seat hold with live countdown, simulated card and demo Kaspi QR payment (`/bookings/:id` & `/fake-kaspi/:token`), downloadable QR tickets, and booking history (`/me/bookings`).
- **Manager & Box Office panel (`/manager`):** 7-day occupancy and revenue report highlighting shows below 30% and above 90%, screening schedule CRUD with overlap checks, movies CRUD/archive, halls & seat layout builder, QR check-in, and booking refund.

## 4. What is technically inside?
- **Frontend:** React, Vite, TypeScript (strict), on Vercel. API types are generated from the backend's OpenAPI file.
- **Backend:** FastAPI (Python 3.12), SQLAlchemy 2, Alembic migrations, on Vercel.
- **Database:** Postgres on Supabase, with separate prod and dev projects. Supabase Auth handles login.
- **Quality gates:** CI runs lint, migrations up/down/up, tests and the API contract check. A PR-rules check enforces the branch name, linked issue and size limit. `main` is protected, and every change goes through a reviewed PR.

## 5. How does data move through the system?
1. The browser calls FastAPI only. The browser can't read any table directly, because row-level security is on and has no policies.
2. Booking is **hold → pay**. Choosing seats creates a `pending` booking with tickets and a `hold_expires_at` 10 minutes ahead. `UNIQUE (screening_id, seat_id)` stops two people from holding the same seat.
3. Payment (fake) creates a `payment` row and marks the booking `paid`. If the hold expires first, a scheduled job (`pg_cron`) marks the booking `expired` and deletes its tickets, so the seats are free again.
4. The manager report reads the `screening_report` view, which aggregates paid tickets per screening.
5. Every staff write adds an `audit_log` row.

Details: [`schema-decisions.md`](../schema-decisions.md).

## 6. What was tested and improved?
_Week 12:_ CI verifies `ruff check` / `ruff format`, Alembic migrations up/down/up, 199 backend `pytest` cases (booking concurrency/holds, overlap rules, Kaspi QR invoice, manager CRUD, staff check-in/refund), and OpenAPI contract sync (`openapi.json` → `schema.d.ts`) alongside frontend `oxlint`, `tsc -b`, and Vite production builds.
Design improvements over Task 09:
- the hold → pay split instead of one transaction
- a ticket type instead of a free-form discount
- an overlap rule for screenings in the same hall
- a staff table with roles

## 7. What did each member personally contribute?
Kept in the weekly files ([`week-10.md`](week-10.md), [`week-12.md`](week-12.md)), with evidence from GitHub.
As of Week 12, architecture, backend/frontend core, UI design system, manager panel, and CI/deploy are by Aldiyar Yeskenov (`@sawayaka143`); demo Kaspi QR payment, IMAX hall relayout, and the Three.js 3D hall viewer are by Sanzhar Saparkhan (`@Sanzhar872`). The other members have no recorded repository contributions yet.

## 8. What makes the solution useful or different?
- Seats can't be double-booked, and the database enforces it, not only the UI.
- Abandoned payments free their seats automatically after 10 minutes.
- Managers get a decision, not just data: an occupancy and revenue report that shows which screenings to move, cancel or add.

## 9. What would we improve with more time?
- Cashier and admin screens. They were dropped from scope in Week 10 to protect the MVP.
- A real payment provider.
- Email tickets with a QR code.
- PostHog analytics on the booking funnel.
