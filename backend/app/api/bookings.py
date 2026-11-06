"""A customer's own bookings: the 10-minute hold countdown and cancelling a hold.

Expiry follows docs/schema-decisions.md §6: the SQL function expire_stale_holds() turns
pending bookings past hold_expires_at into 'expired' and deletes their tickets. pg_cron runs
it every minute; the endpoints here also run it first (the lazy check), so a client never
sees a hold that should already have ended.
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.auth import CurrentUser, CurrentUserDep
from app.db import get_session
from app.models import Booking, Customer, Seat, Ticket

router = APIRouter(tags=["bookings"])

SessionDep = Annotated[Session, Depends(get_session)]


class BookingTicketOut(BaseModel):
    ticket_id: int
    screening_id: int
    seat_id: int
    row_label: str
    seat_number: int
    price: Decimal


class BookingOut(BaseModel):
    booking_id: int
    status: Literal["pending", "paid", "cancelled", "expired"]
    booking_time: datetime
    hold_expires_at: datetime
    seconds_left: int = Field(
        description="Seconds until the hold ends. 0 unless the booking is pending."
    )
    total_amount: Decimal
    tickets: list[BookingTicketOut]


def expire_stale_holds(db: Session, screening_id: int | None = None) -> int:
    """Run the lazy expiry check. Returns how many bookings it expired. Commits."""
    expired = db.scalar(text("SELECT expire_stale_holds(:sid)"), {"sid": screening_id})
    db.commit()
    return expired or 0


def _own_booking(db: Session, user: CurrentUser, booking_id: int, *, lock: bool = False) -> Booking:
    """The logged-in customer's booking, or 404 (also for other people's bookings)."""
    query = (
        select(Booking)
        .join(Customer, Customer.customer_id == Booking.customer_id)
        .where(Booking.booking_id == booking_id, Customer.auth_user_id == user.id)
    )
    if lock:
        query = query.with_for_update(of=Booking)
    booking = db.scalar(query)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    return booking


def _booking_out(db: Session, booking: Booking) -> BookingOut:
    rows = db.execute(
        select(Ticket, Seat)
        .join(Seat, Seat.seat_id == Ticket.seat_id)
        .where(Ticket.booking_id == booking.booking_id)
        .order_by(Seat.row_label, Seat.seat_number)
    ).all()
    tickets = [
        BookingTicketOut(
            ticket_id=t.ticket_id,
            screening_id=t.screening_id,
            seat_id=s.seat_id,
            row_label=s.row_label,
            seat_number=s.seat_number,
            price=t.price,
        )
        for t, s in rows
    ]
    seconds_left = 0
    if booking.status == "pending":
        left = booking.hold_expires_at - datetime.now(UTC)
        seconds_left = max(0, int(left.total_seconds()))
    return BookingOut(
        booking_id=booking.booking_id,
        status=booking.status,
        booking_time=booking.booking_time,
        hold_expires_at=booking.hold_expires_at,
        seconds_left=seconds_left,
        total_amount=sum((t.price for t in tickets), Decimal("0.00")),
        tickets=tickets,
    )


@router.get("/bookings/{booking_id}", response_model=BookingOut)
def get_booking(booking_id: int, user: CurrentUserDep, db: SessionDep) -> BookingOut:
    """One of my bookings, with the seconds left on its hold (for the countdown)."""
    expire_stale_holds(db)
    return _booking_out(db, _own_booking(db, user, booking_id))


@router.post("/bookings/{booking_id}/cancel", response_model=BookingOut)
def cancel_booking(booking_id: int, user: CurrentUserDep, db: SessionDep) -> BookingOut:
    """Cancel my pending hold: the booking becomes 'cancelled' and its seats are free again.

    Paid bookings are cancelled (with a refund) by a cashier or manager, not here.
    """
    expire_stale_holds(db)
    booking = _own_booking(db, user, booking_id, lock=True)
    if booking.status != "pending":
        db.rollback()
        detail = (
            "The hold has expired"
            if booking.status == "expired"
            else f"Only a pending booking can be cancelled (it is {booking.status})"
        )
        raise HTTPException(status.HTTP_409_CONFLICT, detail)
    booking.status = "cancelled"
    db.execute(delete(Ticket).where(Ticket.booking_id == booking.booking_id))
    db.commit()
    return _booking_out(db, booking)
