# Course brief: Cinema Ticketing System

Basics of Information Systems (KBTU), team project. Weekly tasks from the teacher; a working product by **week 14**, demo in **week 15** (≥ 15 points of the 2nd attestation).

Source: Week 9 "Database Project Check" ([`task09.docx`](task09.docx), ERD: [`task09-erd.png`](task09-erd.png)).
**The database design in [`schema-decisions.md`](schema-decisions.md) replaces section 3 below.** It is the version we build.

## Team

| Name | ID | Team role |
|---|---|---|
| Shakarbekov Zhakhongir | 24B032107 | Systems Analysis & Requirements |
| Idakhan Akzhol | 24B031813 | Testing, Analytics Integration |
| Saparkhan Sanzhar | 24B031998 | Application & Development |
| Yeskenov Aldiyar | 24B031763 | Data and Database (repo owner, frontend) |
| Abiltayev Ulan | 24B031593 | Architecture & Security |

## Main action

Booking tickets for a screening. A registered customer selects a movie, a screening (date, time, hall), chooses free seats on the hall map and pays online.
The system creates one booking, one ticket for every chosen seat, and a payment record.

Data collected: customer contact data, movie, hall, seat, screening time and price, booking status, ticket price, payment method and status.

## Original table plan (Task 09, superseded)

CUSTOMER, MOVIE, GENRE, MOVIE_GENRE (bridge), HALL, SEAT, SCREENING, BOOKING, TICKET (bridge SCREENING–SEAT), PAYMENT.
Key rules: `UNIQUE (screening_id, seat_id)` on TICKET (no double booking); booking status `pending / paid / cancelled`; payment method `card / kaspi / cash`;
card numbers are never stored, only the payment provider's token.

## Business query: occupancy and revenue for the next 7 days

> How full is every screening of the next 7 days, and how much money has each one earned?

Decision it supports: shows below 30 % occupancy move to a smaller hall or get cancelled; shows above 90 % get an extra screening.
(Fixed version: view `screening_report` in `schema-decisions.md`. It's the core of the manager dashboard.)

## Roles and access

| Role | Can see / change | Cannot |
|---|---|---|
| Customer | Movies, screenings, free seats; only own bookings, tickets, payments | Other customers' data, prices, reports |
| Cashier | Today's bookings and tickets; sell and cancel tickets | Payment details, customer export, prices |
| Manager | Movies, halls, screenings, prices; aggregated sales reports | Customer passwords, payment tokens |
| Admin | User accounts and roles, all tables for support (actions are logged) | — |

Sensitive fields: customer email and phone, payment data.

## Booking transaction

Booking, its tickets and its payment succeed or fail together: a taken seat or a declined payment rolls everything back, so seats never stay blocked by a half-finished booking.
(We split it into **hold → pay**, with a 10-minute hold expiry. See `schema-decisions.md` §6.)

## Open items from Task 09 (due 13.11.2026, week 11)

| Item | Owner |
|---|---|
| Discount types (now `ticket_type`) | Zhakhongir |
| Phone format check `+7XXXXXXXXXX` | Akzhol |
| Seat must belong to the screening's hall (trigger) | Sanzhar |
| `total_amount` as a view (`booking_total`) | Aldiyar |
| 10-minute hold expiry | Ulan |
