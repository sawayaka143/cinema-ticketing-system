## Booking

Flow and statuses follow `docs/schema-decisions.md` §6. Endpoint paths are provisional until the booking API exists; update them then.
Seats have no status of their own: a seat is "taken" when a `ticket` row exists for it in that screening, and "free" when none does.

| ID | Preconditions | Steps | Expected result | Actual result |
| --- | --- | --- | --- | --- |
| BOOK-01 | Screening exists; seats row 1 seat 5 and 6 have no `ticket` for it; customer is logged in | Hold-seats endpoint (`POST /bookings`, provisional) with the `screening_id` and both seats | HTTP 201. One `booking` row with `status = 'pending'` and `hold_expires_at` ≈ now + 10 minutes. Two `ticket` rows for that booking and screening | |
| BOOK-02 | Seats row 1 seat 5 and 6 already have `ticket` rows from another customer's `pending` booking that is still inside its hold | Same hold request as BOOK-01 as a second customer | HTTP 409 (`UNIQUE (screening_id, seat_id)` rejects it). The whole transaction rolls back: no new `booking`, no new `ticket` rows | |
| BOOK-03 | A `pending` booking of the logged-in customer with `hold_expires_at` in the future | Pay endpoint (`POST /bookings/{id}/pay`, provisional) with the fake payment succeeding | HTTP 200. One `payment` row with `status = 'success'` and `amount` equal to `booking_total`; `paid_at` is set; booking `status = 'paid'`; the tickets stay | |
| BOOK-04 | A booking that was `pending` and whose `hold_expires_at` is now in the past | Pay endpoint for that booking | HTTP 409 (hold expired). No successful `payment` row. The booking is `expired` and its tickets are deleted | |
| BOOK-05 | A `pending` booking with two tickets and `hold_expires_at` in the past, nobody paid | Wait for the `pg_cron` expiry job (runs every minute), or request a hold for the same screening (the lazy expiry check runs first) | Booking `status = 'expired'`; its `ticket` rows are deleted; the seats can be held again (BOOK-01 succeeds for another customer) | |
