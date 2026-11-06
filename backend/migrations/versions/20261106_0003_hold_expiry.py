"""hold expiry: expire_stale_holds() and a pg_cron job

Adds the SQL function expire_stale_holds(screening_id) from docs/schema-decisions.md §6:
pending bookings past hold_expires_at become 'expired' and their tickets are deleted,
so the seats are free again. It runs every minute through pg_cron where the extension
exists (Supabase); elsewhere (local Postgres, CI) only the lazy check in the API runs.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-06
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JOB = "expire-stale-holds"


def upgrade() -> None:
    op.execute("""
        CREATE FUNCTION expire_stale_holds(p_screening_id bigint DEFAULT NULL)
        RETURNS integer
        LANGUAGE sql
        SET search_path = public
        AS $$
            WITH stale AS (
                UPDATE booking b
                SET status = 'expired'
                WHERE b.status = 'pending'
                  AND b.hold_expires_at <= now()
                  AND (p_screening_id IS NULL OR EXISTS (
                      SELECT 1 FROM ticket t
                      WHERE t.booking_id = b.booking_id AND t.screening_id = p_screening_id
                  ))
                RETURNING b.booking_id
            ),
            freed AS (
                DELETE FROM ticket t USING stale WHERE t.booking_id = stale.booking_id
            )
            SELECT count(*)::integer FROM stale
        $$
    """)
    op.execute(f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT FROM pg_available_extensions WHERE name = 'pg_cron') THEN
                CREATE EXTENSION IF NOT EXISTS pg_cron;
                PERFORM cron.schedule('{JOB}', '* * * * *', 'SELECT expire_stale_holds()');
            END IF;
        END $$
    """)


def downgrade() -> None:
    op.execute(f"""
        DO $$
        BEGIN
            -- Nested IFs: cron.job doesn't exist (and can't be parsed) without the extension.
            IF EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_cron') THEN
                IF EXISTS (SELECT FROM cron.job WHERE jobname = '{JOB}') THEN
                    PERFORM cron.unschedule('{JOB}');
                END IF;
            END IF;
        END $$
    """)
    op.execute("DROP FUNCTION expire_stale_holds(bigint)")
