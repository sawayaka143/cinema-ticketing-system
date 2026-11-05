# Week 10 status check (2026-10-31 – 2026-11-06)

First check. "Since the last check" means since the Week 9 database task (Task 09).

## Team report

| | |
|---|---|
| Stage | **Technical foundation exists.** The database (migrations 0001 and 0002), the catalog API, login with profiles, demo seed data and the frontend shell all work. Booking is not connected yet |
| Status | **At Risk** (details below) |
| Milestone W10 | **14/14 issues closed** |
| Main process | movie → screening → seats → hold → pay → tickets: **movie and screening work end to end** (database → API → UI). Seats, hold, payment and tickets are W11 |

**What changed since Task 09**
- The Task 09 design was reviewed question by question and fixed in [`schema-decisions.md`](../schema-decisions.md). The repo, workflow rules, CI and the Vercel deployment for frontend and backend are set up.
- The whole W10 critical path is merged: first migration with users and catalog tables (#25), second migration with booking, payment and audit tables (#26), catalog read endpoints (#27), demo seed `python -m app.seed` (#28), Supabase login linked to customer and staff profiles with `GET /api/me` (#29), frontend shell with routing, login and real catalog data in the dark theme from #18 (#30).
- The PR size limit was raised to 1,000 changed lines (#32), so one feature fits in one PR.
- All four teammates accepted their invitations and are now collaborators. W11 tasks for them are open as #21–#24.

**Demo**
1. **Browse movies:** the movie list loads from `GET /api/movies` with seeded posters and genres.
2. **Movie page:** details and upcoming screenings for one movie (`/movies/:id`).
3. **Screening page:** hall, time and price for one screening (`/screenings/:id`).
4. **Sign up:** create a customer account on `/login` → `GET /api/me` returns the new customer profile.

**Status: At Risk**
- **Cause:** the owner still does all the work. The teammates joined the repo, but none has a commit, issue, PR or review yet.
- **Impact:** W11 is the core of the MVP (seat map, hold, payment, expiry). If it slips, the W13 feature freeze is at risk.
- **Response:** the owner builds the W11 booking flow. Each teammate has one off-critical-path issue (#21–#24). A task with no branch by **Sun 2026-11-08 20:00** goes back to the owner or is dropped.
- **Responsible:** Aldiyar Yeskenov.

**Team decision this week:** keep the scope to the MVP: the customer booking flow and the manager panel. Cashier and admin screens stay out.

**Next team milestone:** W11 (due 2026-11-13). A customer picks free seats on the hall map, holds them with a 10-minute countdown, pays (fake) and gets tickets. Unpaid holds expire.

## Individual reports

### Aldiyar Yeskenov (@sawayaka143): repo owner, frontend, and now backend
- **Completed:**
  - Task 09 document, the schema review in `schema-decisions.md`, workflow rules, CI and deployment.
  - PRs #2, #4, #6, #8, #16, #18, #20 (setup, CI, placeholder front-end, status checks).
  - W10 critical path, all merged 2026-11-05: #25 first migration (+316/−2), #26 second migration (+292/−1), #27 catalog endpoints (+961/−2), #28 seed data (+277), #29 auth and profiles (+414/−20), #30 frontend shell (+896/−160), #32 PR size limit (+7/−7).
- **Evidence:** the merged PRs above. Milestone W10 is 14/14 closed.
- **Last week's task:** done (#9–#14).
- **Difficulty:** carrying the whole project alone.
- **Next task (due 2026-11-13):** the W11 booking flow:
  - seat map endpoint and UI (free, held and sold seats)
  - hold seats with a 10-minute countdown
  - fake payment that issues tickets
  - hold expiry
  - `booking_total`
  - `ticket_type` seed

### Sanzhar Saparkhan (@Sanzhar872): backend
- **Completed:** No evidence. The invitation is accepted, but there is no commit, issue, PR or review yet.
- **Next task (due 2026-11-13):** [#21](https://github.com/sawayaka143/cinema-ticketing-system/issues/21), seat-hall trigger migration (`seat.hall_id = screening.hall_id`). Checkable result: the migration plus a test showing that a ticket for a seat from another hall is rejected. No branch by 2026-11-08 20:00 → back to the owner or dropped.

### Ulan Abiltayev (@Ransa19): booking
- **Completed:** No evidence. The invitation is accepted, but there is no commit, issue, PR or review yet.
- **Next task (due 2026-11-13):** [#22](https://github.com/sawayaka143/cinema-ticketing-system/issues/22), the booking section of `docs/test-cases.md`: 5 hold, payment and expiry cases. Checkable result: the file is merged, and each case has steps and an expected result. No branch by 2026-11-08 20:00 → back to the owner or dropped.

### Zhakhongir Shakarbekov (@Zhakha749): requirements, discounts
- **Completed:** No evidence. The invitation is accepted, but there is no commit, issue, PR or review yet.
- **Next task (due 2026-11-13):** [#23](https://github.com/sawayaka143/cinema-ticketing-system/issues/23), `ticket_type` discounts. Checkable result: the issue has acceptance criteria and price rules that the owner agrees to. No branch by 2026-11-08 20:00 → back to the owner or dropped.

### Akzhol Idakhan (@akzhol01): tests, phone validation
- **Completed:** No evidence. The invitation is accepted, but there is no commit, issue, PR or review yet.
- **Next task (due 2026-11-13):** [#24](https://github.com/sawayaka143/cinema-ticketing-system/issues/24), phone format validation (`+7XXXXXXXXXX`) in the backend. Checkable result: a merged PR where a wrong format returns 400, with a success test and a failure test. No branch by 2026-11-08 20:00 → back to the owner or dropped.

## Next tasks

| Who | Task | Deadline | How we check it |
|---|---|---|---|
| Aldiyar | Seat map endpoint and UI, hold with a 10-minute countdown | 2026-11-13 | On the deployed site, picking seats holds them and shows the countdown; a second customer sees them as taken |
| Aldiyar | Fake payment, hold expiry, `booking_total`, `ticket_type` seed | 2026-11-13 | Paying issues tickets; an unpaid hold frees its seats after 10 minutes; tests pass |
| Sanzhar | [#21](https://github.com/sawayaka143/cinema-ticketing-system/issues/21) Seat-hall trigger | 2026-11-13 | A test inserts a wrong-hall ticket and it fails |
| Ulan | [#22](https://github.com/sawayaka143/cinema-ticketing-system/issues/22) Booking test cases | 2026-11-13 | `docs/test-cases.md` is merged with 5 cases |
| Zhakhongir | [#23](https://github.com/sawayaka143/cinema-ticketing-system/issues/23) Discount rules | 2026-11-13 | The issue has acceptance criteria and is agreed |
| Akzhol | [#24](https://github.com/sawayaka143/cinema-ticketing-system/issues/24) Phone validation | 2026-11-13 | A wrong format returns 400; tests pass |

Teammate issues are assigned when the person picks one up. With no branch by Sun 2026-11-08 20:00, the task goes back to the owner or is dropped.

## Stale issues (3-day rule)

None. #21–#24 were opened 2026-11-05 and are not assigned yet. The 2026-11-08 20:00 cutoff applies to them.

## Ready? (check before class)
- [x] We can show a new result, not only talk about it (browse movies → movie page → screening page → sign up, on real data)
- [x] Every member has evidence or is honestly marked "No evidence"
- [x] Every member has one measurable task with an owner, deadline and checkable result
