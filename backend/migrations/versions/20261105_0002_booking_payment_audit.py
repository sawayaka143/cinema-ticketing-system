"""booking, payment and audit tables

Creates ticket_type, booking, ticket, payment, audit_log as in
docs/schema-decisions.md section 2, the section 5 indexes and view screening_report.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-05
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ["ticket_type", "booking", "ticket", "payment", "audit_log"]


def upgrade() -> None:
    op.execute("""
        CREATE TABLE ticket_type (
            ticket_type_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name           varchar(30) NOT NULL UNIQUE,
            discount_pct   numeric(5, 2) NOT NULL DEFAULT 0
                           CHECK (discount_pct >= 0 AND discount_pct < 100),
            max_age        int,
            staff_only     boolean NOT NULL DEFAULT false
        )
    """)
    op.execute("""
        CREATE TABLE booking (
            booking_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            customer_id      bigint REFERENCES customer (customer_id) ON DELETE RESTRICT,
            sold_by_staff_id bigint REFERENCES staff (staff_id) ON DELETE RESTRICT,
            booking_time     timestamptz NOT NULL DEFAULT now(),
            status           text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
            hold_expires_at  timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
            CHECK (customer_id IS NOT NULL OR sold_by_staff_id IS NOT NULL)
        )
    """)
    op.execute("""
        CREATE TABLE ticket (
            ticket_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            booking_id     bigint NOT NULL REFERENCES booking (booking_id) ON DELETE CASCADE,
            screening_id   bigint NOT NULL REFERENCES screening (screening_id) ON DELETE RESTRICT,
            seat_id        bigint NOT NULL REFERENCES seat (seat_id) ON DELETE RESTRICT,
            ticket_type_id bigint NOT NULL REFERENCES ticket_type (ticket_type_id)
                           ON DELETE RESTRICT,
            price          numeric(8, 2) NOT NULL CHECK (price > 0),
            CONSTRAINT ticket_seat_taken UNIQUE (screening_id, seat_id)
        )
    """)
    op.execute("""
        CREATE TABLE payment (
            payment_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            booking_id   bigint NOT NULL REFERENCES booking (booking_id) ON DELETE RESTRICT,
            amount       numeric(10, 2) NOT NULL CHECK (amount > 0),
            method       text NOT NULL CHECK (method IN ('card', 'kaspi', 'cash')),
            status       text NOT NULL CHECK (status IN ('success', 'failed', 'refunded')),
            provider_ref text,
            created_at   timestamptz NOT NULL DEFAULT now(),
            paid_at      timestamptz,
            refunded_at  timestamptz
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX payment_one_success_idx ON payment (booking_id)
        WHERE status IN ('success', 'refunded')
    """)
    op.execute("""
        CREATE TABLE audit_log (
            audit_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            staff_id   bigint NOT NULL REFERENCES staff (staff_id) ON DELETE RESTRICT,
            action     text NOT NULL,
            table_name text NOT NULL,
            row_id     bigint,
            details    jsonb,
            created_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ticket_booking_idx ON ticket (booking_id)")
    op.execute("CREATE INDEX booking_customer_idx ON booking (customer_id)")
    op.execute("CREATE INDEX booking_status_hold_idx ON booking (status, hold_expires_at)")

    op.execute("""
        CREATE VIEW screening_report AS
        SELECT s.screening_id,
               m.title,
               h.name AS hall,
               s.start_time,
               hc.capacity,
               COUNT(b.booking_id) AS tickets_sold,
               ROUND(100.0 * COUNT(b.booking_id) / NULLIF(hc.capacity, 0), 1) AS occupancy_pct,
               COALESCE(SUM(t.price) FILTER (WHERE b.booking_id IS NOT NULL), 0) AS revenue
        FROM screening s
        JOIN movie m          ON m.movie_id = s.movie_id
        JOIN hall h           ON h.hall_id = s.hall_id
        JOIN hall_capacity hc ON hc.hall_id = s.hall_id
        LEFT JOIN ticket t    ON t.screening_id = s.screening_id
        LEFT JOIN booking b   ON b.booking_id = t.booking_id AND b.status = 'paid'
        WHERE s.start_time BETWEEN now() AND now() + interval '7 days'
        GROUP BY s.screening_id, m.title, h.name, s.start_time, hc.capacity
        ORDER BY occupancy_pct ASC
    """)

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute("DROP VIEW screening_report")
    for table in reversed(TABLES):
        op.execute(f"DROP TABLE {table}")
