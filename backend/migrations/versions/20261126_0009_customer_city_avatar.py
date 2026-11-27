"""add city and avatar_url to customer

customer.city: optional home city shown in Settings.
customer.avatar_url: optional preset key (e.g. "preset:reel") or resized data/https image URL.
docs/schema-decisions.md §2 CUSTOMER.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-26
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE customer ADD COLUMN city varchar(60)")
    op.execute("ALTER TABLE customer ADD COLUMN avatar_url text")


def downgrade() -> None:
    op.execute("ALTER TABLE customer DROP COLUMN avatar_url")
    op.execute("ALTER TABLE customer DROP COLUMN city")
