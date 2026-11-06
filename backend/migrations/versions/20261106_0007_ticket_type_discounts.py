"""ticket types student, child, staff (discount values from #57)

| name    | discount_pct | max_age | staff_only |
| student | 20           |         | false      |
| child   | 30           | 11      | false      |
| staff   | 50           |         | true       |
'adult' (0%) exists since 0005. docs/schema-decisions.md §2 (TICKET_TYPE), §9.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-06
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO ticket_type (name, discount_pct, max_age, staff_only) VALUES
            ('student', 20, NULL, false),
            ('child',   30, 11,   false),
            ('staff',   50, NULL, true)
        ON CONFLICT (name) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM ticket_type t
        WHERE t.name IN ('student', 'child', 'staff')
          AND NOT EXISTS (SELECT 1 FROM ticket WHERE ticket_type_id = t.ticket_type_id)
    """)
