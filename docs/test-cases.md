## Booking

| ID | Preconditions | Steps | Expected result | Actual result |
| --- | --- | --- | --- | --- |
| BOOK-01 | Screening exists, seats row 1 seat 5-6 are FREE, valid user authentication token | Send POST `/api/v1/bookings/hold` with `screening_id` and `seat_ids: [5, 6]` | HTTP 201 Created; seats status changed to HELD, `expires_at` set to current time + 10 minutes, booking record created with status `PENDING` | |
| BOOK-02 | Seats row 1 seat 5-6 are already HELD by another user | Send POST `/api/v1/bookings/hold` with `screening_id` and `seat_ids: [5, 6]` | HTTP 409 Conflict; error message indicating seats are unavailable, database state remains unchanged | |
| BOOK-03 | Booking is in status `PENDING` with valid hold timer (< 10 minutes) | Send POST `/api/v1/bookings/{id}/pay` with valid payment details | HTTP 200 OK; booking status updated to `PAID`, seats status updated to `SOLD`, payment transaction recorded | |
| BOOK-04 | Booking hold timer has expired (> 10 minutes passed), booking status is `EXPIRED` | Send POST `/api/v1/bookings/{id}/pay` with valid payment details | HTTP 400 Bad Request (or 422 Unprocessable Entity); payment rejected due to hold expiration, database state unchanged | |
| BOOK-05 | Booking status is `PENDING`, hold timer (> 10 minutes) has passed without payment | Trigger background expiry check / call GET or POST endpoint checking booking status after 10 minutes | HTTP 200 OK; booking status updated to `EXPIRED`, seats status changed back to `FREE` | |