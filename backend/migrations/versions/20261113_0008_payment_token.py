"""payment token for the demo Kaspi QR invoice

booking.payment_token: a random token behind the payment QR code (/fake-kaspi/<token>).
NULL until the customer asks for a Kaspi invoice. docs/schema-decisions.md §2, §8 row 24.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-13
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE booking ADD COLUMN payment_token text UNIQUE")


def downgrade() -> None:
    op.execute("ALTER TABLE booking DROP COLUMN payment_token")
