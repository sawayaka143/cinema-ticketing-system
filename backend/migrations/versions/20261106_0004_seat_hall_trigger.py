"""seat-hall trigger: a ticket's seat must be in the screening's hall

docs/schema-decisions.md §2 (TICKET), §8 row 16 and §9:
- ticket INSERT/UPDATE: seat.hall_id must equal screening.hall_id;
- a seat or screening that already has tickets can't move to another hall.
Both raise check_violation (SQLSTATE 23514), which SQLAlchemy reports as IntegrityError.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-06
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE FUNCTION ticket_seat_in_hall() RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM seat s
                JOIN screening sc ON sc.hall_id = s.hall_id
                WHERE s.seat_id = NEW.seat_id AND sc.screening_id = NEW.screening_id
            ) THEN
                RAISE EXCEPTION 'seat % is not in the hall of screening %',
                    NEW.seat_id, NEW.screening_id
                    USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_seat_in_hall';
            END IF;
            RETURN NEW;
        END
        $$
    """)
    op.execute("""
        CREATE TRIGGER ticket_seat_in_hall
        BEFORE INSERT OR UPDATE OF seat_id, screening_id ON ticket
        FOR EACH ROW EXECUTE FUNCTION ticket_seat_in_hall()
    """)

    op.execute("""
        CREATE FUNCTION hall_locked_by_tickets() RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            has_tickets boolean;
        BEGIN
            -- Separate branches: OLD only has the columns of the table that fired.
            IF TG_TABLE_NAME = 'seat' THEN
                has_tickets := EXISTS (SELECT 1 FROM ticket WHERE seat_id = OLD.seat_id);
            ELSE
                has_tickets := EXISTS (SELECT 1 FROM ticket WHERE screening_id = OLD.screening_id);
            END IF;
            IF has_tickets THEN
                RAISE EXCEPTION '% already has tickets, its hall_id can''t change', TG_TABLE_NAME
                    USING ERRCODE = 'check_violation', CONSTRAINT = 'hall_locked_by_tickets';
            END IF;
            RETURN NEW;
        END
        $$
    """)
    for table in ("seat", "screening"):
        op.execute(f"""
            CREATE TRIGGER {table}_hall_locked
            BEFORE UPDATE OF hall_id ON {table}
            FOR EACH ROW WHEN (NEW.hall_id IS DISTINCT FROM OLD.hall_id)
            EXECUTE FUNCTION hall_locked_by_tickets()
        """)


def downgrade() -> None:
    for table in ("seat", "screening"):
        op.execute(f"DROP TRIGGER {table}_hall_locked ON {table}")
    op.execute("DROP FUNCTION hall_locked_by_tickets()")
    op.execute("DROP TRIGGER ticket_seat_in_hall ON ticket")
    op.execute("DROP FUNCTION ticket_seat_in_hall()")
