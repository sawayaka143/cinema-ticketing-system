"""Staff desk: look up a booking and refund a paid one (docs/schema-decisions.md §6, step 4).

Whole booking only, no partial refunds. The booking becomes 'cancelled', its tickets are
deleted (the seats are free again) and the successful payment becomes 'refunded'.
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.bookings import BookingTicketOut, _booking_out
from app.db import get_session
from app.models import Booking, Customer, Hall, Movie, Payment, Screening, Staff, Ticket
from app.staff import audit, require_staff

router = APIRouter(prefix="/staff", tags=["staff"])

SessionDep = Annotated[Session, Depends(get_session)]
StaffDep = Annotated[Staff, Depends(require_staff())]


class StaffBookingOut(BaseModel):
    booking_id: int
    status: str
    customer_name: str | None
    customer_email: str | None
    movie_title: str | None
    hall: str | None
    start_time: datetime | None
    tickets: list[BookingTicketOut]
    total_amount: Decimal
    checked_in_at: datetime | None


class RefundIn(BaseModel):
    reason: str = Field(min_length=1, max_length=300, examples=["Customer is ill"])


class RefundOut(BaseModel):
    booking_id: int
    status: str
    refunded_amount: Decimal
    refunded_at: datetime


def _booking(db: Session, booking_id: int, *, lock: bool = False) -> Booking:
    query = select(Booking).where(Booking.booking_id == booking_id)
    if lock:
        query = query.with_for_update()
    booking = db.scalar(query)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    return booking


def _screening_of(db: Session, booking_id: int) -> tuple[str, str, Screening] | None:
    row = db.execute(
        select(Movie.title, Hall.name, Screening)
        .select_from(Ticket)
        .join(Screening, Screening.screening_id == Ticket.screening_id)
        .join(Movie, Movie.movie_id == Screening.movie_id)
        .join(Hall, Hall.hall_id == Screening.hall_id)
        .where(Ticket.booking_id == booking_id)
        .limit(1)
    ).first()
    return tuple(row) if row else None


@router.get("/bookings/{booking_id}", response_model=StaffBookingOut)
def look_up_booking(booking_id: int, staff: StaffDep, db: SessionDep) -> StaffBookingOut:
    """Any booking, for the desk: who bought it, for which show, and its state."""
    booking = _booking(db, booking_id)
    customer = db.get(Customer, booking.customer_id) if booking.customer_id else None
    out = _booking_out(db, booking)
    show = _screening_of(db, booking_id)
    return StaffBookingOut(
        booking_id=booking.booking_id,
        status=booking.status,
        customer_name=customer.full_name if customer else None,
        customer_email=customer.email if customer else None,
        movie_title=show[0] if show else None,
        hall=show[1] if show else None,
        start_time=show[2].start_time if show else None,
        tickets=out.tickets,
        total_amount=out.total_amount,
        checked_in_at=booking.checked_in_at,
    )


@router.post("/bookings/{booking_id}/refund", response_model=RefundOut)
def refund_booking(booking_id: int, body: RefundIn, staff: StaffDep, db: SessionDep) -> RefundOut:
    """Cancel a paid booking and refund the whole amount, before the screening starts."""
    booking = _booking(db, booking_id, lock=True)
    if booking.status != "paid":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Only a paid booking can be refunded (it is {booking.status})",
        )
    if booking.checked_in_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The group has already entered the hall")
    show = _screening_of(db, booking_id)
    if show and show[2].start_time <= datetime.now(UTC):
        raise HTTPException(status.HTTP_409_CONFLICT, "The screening has already started")
    payment = db.scalar(
        select(Payment)
        .where(Payment.booking_id == booking_id, Payment.status == "success")
        .with_for_update()
    )
    if payment is None:  # a paid booking always has one (the payment endpoint sets both)
        raise HTTPException(status.HTTP_409_CONFLICT, "No successful payment to refund")

    refunded_at = db.scalar(select(func.now()))
    payment.status = "refunded"
    payment.refunded_at = refunded_at
    booking.status = "cancelled"
    db.execute(delete(Ticket).where(Ticket.booking_id == booking_id))
    audit(
        db,
        staff,
        "refund",
        "booking",
        booking_id,
        amount=str(payment.amount),
        payment_id=payment.payment_id,
        reason=body.reason.strip(),
    )
    db.commit()
    return RefundOut(
        booking_id=booking_id,
        status="cancelled",
        refunded_amount=payment.amount,
        refunded_at=refunded_at,
    )
