"""QR ticket and door check-in on booking

One QR code per paid booking, valid for all its seats (the whole group enters at once):
booking.qr_token, booking.checked_in_at, booking.checked_in_by_staff_id.
docs/schema-decisions.md §2 (BOOKING) and §8 row 23.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-06
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE booking
            ADD COLUMN qr_token text UNIQUE,
            ADD COLUMN checked_in_at timestamptz,
            ADD COLUMN checked_in_by_staff_id bigint
                REFERENCES staff (staff_id) ON DELETE RESTRICT,
            ADD CONSTRAINT booking_checkin_complete
                CHECK ((checked_in_at IS NULL) = (checked_in_by_staff_id IS NULL)),
            ADD CONSTRAINT booking_checkin_needs_qr
                CHECK (checked_in_at IS NULL OR qr_token IS NOT NULL)
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE booking
            DROP CONSTRAINT booking_checkin_needs_qr,
            DROP CONSTRAINT booking_checkin_complete,
            DROP COLUMN checked_in_by_staff_id,
            DROP COLUMN checked_in_at,
            DROP COLUMN qr_token
    """)
