# Schema decisions (before the first migration)

Agreed on 2026-10-30 by reviewing the Week 9 Task 09 document ("Database Project Check: Cinema Ticketing System") question by question.
This file is the source for the first Alembic migration. It is **not** a migration itself.

Database: Supabase Postgres (two projects: prod and dev). All data goes through FastAPI; Supabase is used only for the database and login.

---

## 1. General rules

- **Ids:** `bigint GENERATED ALWAYS AS IDENTITY` (Postgres version of `AUTO_INCREMENT`).
- **Times:** `timestamptz` (time-zone aware, so Almaty times stay correct on UTC servers).
- **Money:** `numeric(8,2)` for one ticket, `numeric(10,2)` for totals and payments.
- **Lists of allowed values** (status, type, role): `text` + `CHECK (... IN (...))`, not Postgres `ENUM`, so adding a value later is a one-line change.
- **ON DELETE:** `RESTRICT` on every foreign key (protects history), except the two `CASCADE`s noted below.
- **Row Level Security:** enabled on **every** table, with **no policies**. The browser's public anon key can then read nothing; FastAPI connects as the database owner and is unaffected.
- **Extensions:** `btree_gist` (screening overlap rule) and `pg_cron` (hold expiry job).

---

## 2. Tables

### CUSTOMER — a person who buys tickets online
| Column | Type | Rules |
|---|---|---|
| customer_id | bigint identity | PK |
| auth_user_id | uuid | NOT NULL, UNIQUE, FK → `auth.users(id)` |
| full_name | varchar(100) | NOT NULL |
| email | varchar(100) | NOT NULL, UNIQUE (copied from Supabase login at sign-up) |
| phone | varchar(20) | NULL; `CHECK (phone ~ '^\+7[0-9]{10}$')` (stored as `+77011234567`) |
| created_at | timestamptz | NOT NULL DEFAULT now() |

### STAFF — cashier, manager or admin account
| Column | Type | Rules |
|---|---|---|
| staff_id | bigint identity | PK |
| auth_user_id | uuid | NOT NULL, UNIQUE, FK → `auth.users(id)` |
| full_name | varchar(100) | NOT NULL |
| role | text | NOT NULL, `CHECK (role IN ('cashier','manager','admin'))` |
| is_active | boolean | NOT NULL DEFAULT true (ex-employees are deactivated, never deleted) |
| created_at | timestamptz | NOT NULL DEFAULT now() |

The same login may have both a CUSTOMER and a STAFF row (UNIQUE is per table, not across both).

### MOVIE — a film the cinema shows
| Column | Type | Rules |
|---|---|---|
| movie_id | bigint identity | PK |
| title | varchar(150) | NOT NULL |
| description | text | NULL |
| poster_url | text | NULL |
| duration_min | int | NOT NULL, `CHECK (duration_min BETWEEN 40 AND 300)` |
| min_age | int | NOT NULL, `CHECK (min_age IN (0,6,12,16,18))` (shown as "16+") |
| release_year | int | `CHECK (release_year BETWEEN 1900 AND 2100)` |
| is_active | boolean | NOT NULL DEFAULT true ("archive" instead of delete) |
| created_at | timestamptz | NOT NULL DEFAULT now() |

### GENRE — reference list of genres
| Column | Type | Rules |
|---|---|---|
| genre_id | bigint identity | PK |
| name | varchar(30) | NOT NULL, UNIQUE |

### MOVIE_GENRE — bridge MOVIE M:N GENRE
| Column | Type | Rules |
|---|---|---|
| movie_id | bigint | NOT NULL, FK → MOVIE **ON DELETE CASCADE** |
| genre_id | bigint | NOT NULL, FK → GENRE (RESTRICT) |
| | | PK (movie_id, genre_id) |

### HALL — a physical hall
| Column | Type | Rules |
|---|---|---|
| hall_id | bigint identity | PK |
| name | varchar(30) | NOT NULL, UNIQUE |
| hall_type | varchar(10) | NOT NULL, `CHECK (hall_type IN ('2D','3D','IMAX'))` |

No `capacity` column: capacity = number of SEAT rows (see view `hall_capacity`).

### SEAT — one seat in one hall
| Column | Type | Rules |
|---|---|---|
| seat_id | bigint identity | PK |
| hall_id | bigint | NOT NULL, FK → HALL |
| row_label | varchar(2) | NOT NULL (printed on the ticket, e.g. "C") |
| seat_number | int | NOT NULL, `CHECK (> 0)` (printed on the ticket, e.g. 7) |
| seat_type | text | NOT NULL DEFAULT 'standard', `CHECK (seat_type IN ('standard','vip','wheelchair'))` |
| grid_row | int | NOT NULL, `CHECK (>= 1)` (drawing position on the seat map) |
| grid_col | int | NOT NULL, `CHECK (>= 1)` (drawing position on the seat map) |
| | | UNIQUE (hall_id, row_label, seat_number) |
| | | UNIQUE (hall_id, grid_row, grid_col) |

Empty grid cells are aisles and gaps. The seat map draws a `max(grid_row) × max(grid_col)` grid.

### SCREENING — one show of one movie in one hall
| Column | Type | Rules |
|---|---|---|
| screening_id | bigint identity | PK |
| movie_id | bigint | NOT NULL, FK → MOVIE |
| hall_id | bigint | NOT NULL, FK → HALL |
| start_time | timestamptz | NOT NULL |
| end_time | timestamptz | NOT NULL; set by FastAPI = start + duration + 15 min cleaning; `CHECK (end_time > start_time)` |
| base_price | numeric(8,2) | NOT NULL, `CHECK (> 0)` |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| | | `EXCLUDE USING gist (hall_id WITH =, tstzrange(start_time, end_time) WITH &&)`: no overlapping shows in one hall |

### TICKET_TYPE — price category (the "PRICE_RULE" from Task 09)
| Column | Type | Rules |
|---|---|---|
| ticket_type_id | bigint identity | PK |
| name | varchar(30) | NOT NULL, UNIQUE (adult, student, child, staff) |
| discount_pct | numeric(5,2) | NOT NULL DEFAULT 0, `CHECK (discount_pct >= 0 AND discount_pct < 100)` |
| max_age | int | NULL = no age limit; child = 11 |
| staff_only | boolean | NOT NULL DEFAULT false |

### BOOKING — one purchase (event)
| Column | Type | Rules |
|---|---|---|
| booking_id | bigint identity | PK |
| customer_id | bigint | NULL, FK → CUSTOMER (online purchase) |
| sold_by_staff_id | bigint | NULL, FK → STAFF (box-office sale) |
| booking_time | timestamptz | NOT NULL DEFAULT now() |
| status | text | NOT NULL DEFAULT 'pending', `CHECK (status IN ('pending','paid','cancelled','expired'))` |
| hold_expires_at | timestamptz | NOT NULL DEFAULT now() + interval '10 minutes' |
| | | `CHECK (customer_id IS NOT NULL OR sold_by_staff_id IS NOT NULL)` |

No `total_amount` column: see view `booking_total`.

### TICKET — one seat for one screening in one booking (bridge SCREENING M:N SEAT)
| Column | Type | Rules |
|---|---|---|
| ticket_id | bigint identity | PK |
| booking_id | bigint | NOT NULL, FK → BOOKING **ON DELETE CASCADE** |
| screening_id | bigint | NOT NULL, FK → SCREENING |
| seat_id | bigint | NOT NULL, FK → SEAT |
| ticket_type_id | bigint | NOT NULL, FK → TICKET_TYPE |
| price | numeric(8,2) | NOT NULL, `CHECK (> 0)`: final price at the moment of sale (historical copy) |
| | | UNIQUE (screening_id, seat_id): no double booking |
| | | Trigger: `seat.hall_id` must equal `screening.hall_id` |

### PAYMENT — one payment attempt for a booking
| Column | Type | Rules |
|---|---|---|
| payment_id | bigint identity | PK |
| booking_id | bigint | NOT NULL, FK → BOOKING |
| amount | numeric(10,2) | NOT NULL, `CHECK (> 0)`: copied from `booking_total` when paying |
| method | text | NOT NULL, `CHECK (method IN ('card','kaspi','cash'))` |
| status | text | NOT NULL, `CHECK (status IN ('success','failed','refunded'))` |
| provider_ref | text | NULL; fake provider transaction id (e.g. `FAKE-8f3a…`). Card numbers are never stored |
| created_at | timestamptz | NOT NULL DEFAULT now() (time of the attempt) |
| paid_at | timestamptz | NULL (set on success) |
| refunded_at | timestamptz | NULL (set on refund) |
| | | Partial unique index: `UNIQUE (booking_id) WHERE status IN ('success','refunded')`: at most one money-taking payment per booking |

### AUDIT_LOG — record of staff actions
| Column | Type | Rules |
|---|---|---|
| audit_id | bigint identity | PK |
| staff_id | bigint | NOT NULL, FK → STAFF |
| action | text | NOT NULL (e.g. 'create', 'update', 'delete', 'refund', 'role_change') |
| table_name | text | NOT NULL |
| row_id | bigint | NULL |
| details | jsonb | NULL (old/new values) |
| created_at | timestamptz | NOT NULL DEFAULT now() |

Written by FastAPI on every staff write (it knows who made the change; a DB trigger would not).

---

## 3. Relationships

| Relationship | Type | Note |
|---|---|---|
| CUSTOMER – BOOKING | 1:M | booking.customer_id is optional (box-office sales) |
| STAFF – BOOKING | 1:M | booking.sold_by_staff_id, cashier sales |
| STAFF – AUDIT_LOG | 1:M | |
| BOOKING – TICKET | 1:M | cascade delete |
| **BOOKING – PAYMENT** | **1:M** | was 1:1; retries after a decline; at most one successful |
| MOVIE – SCREENING | 1:M | |
| MOVIE – GENRE | M:N | via MOVIE_GENRE |
| HALL – SCREENING | 1:M | no overlapping times (exclusion constraint) |
| HALL – SEAT | 1:M | |
| SCREENING – SEAT | M:N | via TICKET, UNIQUE (screening_id, seat_id) |
| TICKET_TYPE – TICKET | 1:M | |
| auth.users – CUSTOMER / STAFF | 1:0..1 each | |

---

## 4. Views

- **`booking_total`**: `booking_id, SUM(ticket.price) AS total_amount`, grouped by booking.
- **`hall_capacity`**: `hall_id, COUNT(seat_id) AS capacity`, grouped by hall.
- **`screening_report`**: weekly occupancy/revenue report for the manager panel, with the bug from Task 09 fixed (screenings whose only tickets were held/pending disappeared from the report):

```sql
SELECT m.title,
       h.name                                              AS hall,
       s.start_time,
       hc.capacity,
       COUNT(b.booking_id)                                 AS tickets_sold,
       ROUND(100.0 * COUNT(b.booking_id) / NULLIF(hc.capacity, 0), 1) AS occupancy_pct,
       COALESCE(SUM(t.price) FILTER (WHERE b.booking_id IS NOT NULL), 0) AS revenue
FROM screening s
JOIN movie m          ON m.movie_id = s.movie_id
JOIN hall  h          ON h.hall_id  = s.hall_id
JOIN hall_capacity hc ON hc.hall_id = s.hall_id
LEFT JOIN ticket  t   ON t.screening_id = s.screening_id
LEFT JOIN booking b   ON b.booking_id   = t.booking_id AND b.status = 'paid'
WHERE s.start_time BETWEEN now() AND now() + interval '7 days'
GROUP BY s.screening_id, m.title, h.name, s.start_time, hc.capacity
ORDER BY occupancy_pct ASC;
```

---

## 5. Indexes (besides PKs and UNIQUEs, which Postgres indexes automatically)

- `screening (start_time)`: weekly report, today's shows
- `ticket (booking_id)`: a booking's tickets, cascade delete
- `booking (customer_id)`: "my bookings"
- `booking (status, hold_expires_at)`: the expiry job finds stale holds

---

## 6. Booking flow (replaces the single transaction in Task 09, section 5)

1. **Hold** (one transaction): first expire stale holds for this screening (lazy check), then INSERT a BOOKING (`pending`, `hold_expires_at = now() + 10 min`) and one TICKET per seat. `UNIQUE (screening_id, seat_id)` rejects a seat that is already taken, so the whole hold rolls back.
2. **Pay**: FastAPI reads `booking_total`, INSERTs a PAYMENT. On `success`: set `paid_at` and booking → `paid`. On `failed`: keep the failed row; the customer may retry until the hold expires.
3. **Expiry**: a `pg_cron` job every minute sets `pending` bookings past `hold_expires_at` to `expired` and **deletes their tickets** (seats become free). The lazy check in step 1 covers the gap between cron runs.
4. **Cancel**:
   - A customer may cancel only their own `pending` booking → `cancelled`, tickets deleted.
   - A `paid` booking is cancelled only by cashier/manager → booking `cancelled`, tickets deleted, the success payment → `refunded` + `refunded_at`. Whole booking only, no partial refunds. Logged in AUDIT_LOG.

Bookings are never deleted; only their tickets are.

---

## 7. Rules enforced in FastAPI (not in the database)

- **Price:** `ticket.price = base_price × (1.5 if seat_type = 'vip' else 1) × (1 − discount_pct / 100)`, rounded to 2 decimals.
- **Age vs ticket type:** a ticket type with `max_age` can't be used for a movie with `min_age > max_age` (e.g. no child tickets for 12+ and older). The seat-map UI hides those types. The real ID check for 16+/18+ happens at the cinema door; no birthdates are stored.
- **Staff discount:** a `staff_only` ticket type is allowed only if the logged-in user also has an **active** STAFF row; at most **2** staff tickets per booking.
- **Roles:** every request maps the Supabase login to CUSTOMER and/or active STAFF; customers see only their own bookings, tickets and payments.
- **Screening end_time:** start_time + movie.duration_min + 15 min.
- **Phone:** strip spaces/dashes and normalize to `+7XXXXXXXXXX` before saving.
- **Deleting:** movies with screenings are archived (`is_active = false`); screenings with tickets can't be deleted ("has sold tickets").
- **Audit:** every staff write adds an AUDIT_LOG row.

---

## 8. Changes vs the Task 09 document

| # | Change | Reason |
|---|---|---|
| 1 | MySQL types → Postgres (`identity`, `timestamptz`, `numeric`, text + CHECK) | Supabase is Postgres; time zones matter on Vercel (UTC) |
| 2 | RLS enabled on all tables, no policies | The public anon key in the frontend must not read tables directly |
| 3 | CUSTOMER + `auth_user_id` | Links a customer to their Supabase login |
| 4 | New STAFF table (role, is_active) | Staff roles need a home; customers aren't staff |
| 5 | MOVIE + `description`, `poster_url`, `is_active` | Browse page needs them; archive instead of a delete that RESTRICT blocks |
| 6 | MOVIE `age_rating` text → `min_age int` | Numeric comparison with ticket-type age limits |
| 7 | HALL `capacity` removed (view `hall_capacity`) | One fact, one place; capacity could disagree with real seats |
| 8 | SEAT + `grid_row`, `grid_col`, `wheelchair` seat type | Real seat map with aisles; accessibility |
| 9 | SCREENING + `end_time`, exclusion constraint replaces UNIQUE (hall_id, start_time) | The old rule didn't stop overlapping shows |
| 10 | New TICKET_TYPE table; TICKET + `ticket_type_id` | Student/child/staff discounts (Task 09 open item) |
| 11 | BOOKING `total_amount` removed (view `booking_total`) | Stored total could disagree with tickets (Task 09 open item) |
| 12 | BOOKING + `hold_expires_at`, status `expired` | 10-minute hold (Task 09 open item) |
| 13 | BOOKING `customer_id` nullable + `sold_by_staff_id` | Cashier box-office sales to people without accounts |
| 14 | BOOKING–PAYMENT 1:1 → 1:M, one success max | Fake payments can decline; customers must be able to retry |
| 15 | PAYMENT + `provider_ref`, `created_at`, `refunded_at` | Security section promises a provider token only; refunds need a time |
| 16 | Trigger: ticket seat must be in the screening's hall | Task 09 open item |
| 17 | Phone CHECK `^\+7[0-9]{10}$` | Task 09 open item |
| 18 | ON DELETE CASCADE on MOVIE_GENRE.movie_id and TICKET.booking_id | Harmless child rows; everything else stays RESTRICT |
| 19 | New AUDIT_LOG table | Task 09 promises Admin actions are logged |
| 20 | Report query fixed and saved as view `screening_report`; uses `hall_capacity` | Screenings with only held tickets disappeared from the report |
| 21 | Four extra indexes | Report and common screens stay fast |
| 22 | Booking is two steps (hold, then pay), not one transaction | Matches the seat-map + 10-minute-hold flow |

---

## 9. Open questions

- **Discount values:** exact `discount_pct` for student, child, staff (proposed staff = 50%), and the child `max_age` (proposed 11). Owner: Zhakhongir.
- **VIP multiplier:** proposed 1.5×. Confirm.
- **Cleaning buffer:** proposed 15 min between shows. Confirm.
- **Rating list:** keep 0+/6+/12+/16+/18+, or add more (e.g. 3+)?
- **pg_cron:** confirm it can be enabled on both Supabase projects (prod and dev).
- **Seat-hall trigger:** should it also fire when a seat's `hall_id` or a screening's `hall_id` changes? Proposed: simply forbid changing `hall_id` on seats/screenings that already have tickets.
- **Task 09 talking points to update** before the demo: Sanzhar (BOOKING–PAYMENT is now 1:M), Ulan (two-step booking, hold expiry), Aldiyar (capacity and total_amount are views), Akzhol (Postgres types, phone CHECK), Zhakhongir (TICKET_TYPE).
