"""Ticket-type rules (docs/schema-decisions.md §7, spec in #57).

- A type with max_age can't be used for a movie whose min_age is higher (no child tickets for 12+).
- A staff_only type needs an active STAFF row for the login; at most 2 per booking.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.models import Staff, TicketType

DEFAULT_TYPE = "adult"
MAX_STAFF_TICKETS = 2


def is_active_staff(db: Session, user: CurrentUser | None) -> bool:
    if user is None:
        return False
    return (
        db.scalar(select(Staff.staff_id).where(Staff.auth_user_id == user.id, Staff.is_active))
        is not None
    )


def age_problem(ticket_type: TicketType, movie_min_age: int) -> str | None:
    """Why this type can't be used for a movie with this age rating, or None."""
    if ticket_type.max_age is not None and movie_min_age > ticket_type.max_age:
        return f"{ticket_type.name} tickets are not allowed for {movie_min_age}+"
    return None


def choosable(db: Session, movie_min_age: int, is_staff: bool) -> list[TicketType]:
    """The types a customer may pick for a movie, smallest discount first."""
    types = db.scalars(select(TicketType).order_by(TicketType.discount_pct, TicketType.name))
    return [
        t for t in types if age_problem(t, movie_min_age) is None and (is_staff or not t.staff_only)
    ]
