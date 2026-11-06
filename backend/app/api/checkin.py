"""Door check-in: staff scan a booking's QR code and the whole group enters once."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.catalog import ALMATY
from app.db import get_session
from app.models import Booking, Hall, Movie, Screening, Seat, Staff, Ticket
from app.staff import audit, require_staff

router = APIRouter(tags=["checkin"])

SessionDep = Annotated[Session, Depends(get_session)]
StaffDep = Annotated[Staff, Depends(require_staff())]

# Doors open this long before the start; entry is possible until the screening ends.
DOORS_OPEN = timedelta(minutes=30)


class CheckinIn(BaseModel):
    token: str = Field(min_length=1, max_length=200, description="The text in the QR code")


class CheckinOut(BaseModel):
    booking_id: int
    movie_title: str
    hall: str
    start_time: datetime
    seats: list[str] = Field(examples=[["A5", "A6"]])
    people: int
    checked_in_at: datetime


def _local(t: datetime) -> str:
    return t.astimezone(ALMATY).strftime("%H:%M")


@router.post("/checkin", response_model=CheckinOut)
def check_in(body: CheckinIn, staff: StaffDep, db: SessionDep) -> CheckinOut:
    """Validate a scanned QR code and let the whole booking in (once)."""
    booking = db.scalar(
        select(Booking).where(Booking.qr_token == body.token.strip()).with_for_update()
    )
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown ticket")
    if booking.status != "paid":
        raise HTTPException(status.HTTP_409_CONFLICT, f"The booking is {booking.status}")
    if booking.checked_in_at is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Already used at {_local(booking.checked_in_at)}"
        )

    rows = db.execute(
        select(Seat.row_label, Seat.seat_number, Screening, Movie.title, Hall.name)
        .select_from(Ticket)
        .join(Seat, Seat.seat_id == Ticket.seat_id)
        .join(Screening, Screening.screening_id == Ticket.screening_id)
        .join(Movie, Movie.movie_id == Screening.movie_id)
        .join(Hall, Hall.hall_id == Screening.hall_id)
        .where(Ticket.booking_id == booking.booking_id)
        .order_by(Seat.row_label, Seat.seat_number)
    ).all()
    if not rows:  # a paid booking always has tickets; refunds set it to 'cancelled'
        raise HTTPException(status.HTTP_409_CONFLICT, "The booking has no tickets")
    screening: Screening = rows[0][2]
    now = datetime.now(UTC)
    if now < screening.start_time - DOORS_OPEN:
        opens = _local(screening.start_time - DOORS_OPEN)
        raise HTTPException(status.HTTP_409_CONFLICT, f"Too early: entry opens at {opens}")
    if now > screening.end_time:
        raise HTTPException(status.HTTP_409_CONFLICT, "The screening has ended")

    booking.checked_in_at = now
    booking.checked_in_by_staff_id = staff.staff_id
    audit(db, staff, "checkin", "booking", booking.booking_id, people=len(rows))
    db.commit()
    return CheckinOut(
        booking_id=booking.booking_id,
        movie_title=rows[0][3],
        hall=rows[0][4],
        start_time=screening.start_time,
        seats=[f"{row}{number}" for row, number, *_ in rows],
        people=len(rows),
        checked_in_at=now,
    )
