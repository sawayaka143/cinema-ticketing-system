"""booking_total view and the reference ticket type 'adult'

docs/schema-decisions.md §4 (view booking_total) and §2 (TICKET_TYPE). 'adult' (no discount)
is reference data the hold endpoint needs; student/child/staff wait for #23.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-06
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE VIEW booking_total AS
        SELECT booking_id, SUM(price) AS total_amount
        FROM ticket
        GROUP BY booking_id
    """)
    op.execute("""
        INSERT INTO ticket_type (name, discount_pct)
        VALUES ('adult', 0)
        ON CONFLICT (name) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM ticket_type t
        WHERE t.name = 'adult'
          AND NOT EXISTS (SELECT 1 FROM ticket WHERE ticket_type_id = t.ticket_type_id)
    """)
    op.execute("DROP VIEW booking_total")
