"""Demo "Kaspi QR" payment: no real money, it shows how the real Kaspi QR flow would work.

1. The site asks for an invoice for a pending booking and shows its link as a QR code.
2. The phone opens /fake-kaspi/<token> (frontend), which reads GET /api/fake-kaspi/<token>.
3. "Pay" calls POST /api/fake-kaspi/<token>/pay. The site polls GET /api/bookings/{id}
   and moves on to the tickets once the booking is paid.

The token is the only access to the pay page (no login on the phone), so it is random and
long, and the page never shows the customer's name or email.
"""

import secrets
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.bookings import (
    _booking_out,
    _own_booking,
    ensure_payable,
    expire_stale_holds,
    settle_payment,
)
from app.auth import CurrentUserDep
from app.db import get_session
from app.models import Booking, Hall, Movie, Screening

router = APIRouter(tags=["fake-kaspi"])

SessionDep = Annotated[Session, Depends(get_session)]

MERCHANT = "Alatau Cinema"
PAYMENT_TOKEN_BYTES = 24  # 192 random bits; the token is the only key to the pay page


class InvoiceOut(BaseModel):
    booking_id: int
    payment_token: str
    pay_path: str = Field(
        description="Frontend path for the QR code; prefix it with the site's origin",
        examples=["/fake-kaspi/3q2-x…"],
    )
    amount: Decimal
    seconds_left: int


class FakeKaspiOut(BaseModel):
    merchant: str
    amount: Decimal
    status: Literal["pending", "paid", "cancelled", "expired"]
    seconds_left: int
    movie_title: str | None
    hall: str | None
    start_time: datetime | None
    seats: list[str] = Field(examples=[["A5", "A6"]])


class FakePayIn(BaseModel):
    decline: bool = Field(default=False, description="true shows a declined payment (demo)")


def _by_token(db: Session, token: str, *, lock: bool = False) -> Booking:
    query = select(Booking).where(Booking.payment_token == token)
    if lock:
        query = query.with_for_update()
    booking = db.scalar(query)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown payment link")
    return booking


def _page(db: Session, booking: Booking) -> FakeKaspiOut:
    out = _booking_out(db, booking)
    show = None
    if out.tickets:
        show = db.execute(
            select(Movie.title, Hall.name, Screening.start_time)
            .join(Screening, Screening.movie_id == Movie.movie_id)
            .join(Hall, Hall.hall_id == Screening.hall_id)
            .where(Screening.screening_id == out.tickets[0].screening_id)
        ).one()
    return FakeKaspiOut(
        merchant=MERCHANT,
        amount=out.total_amount,
        status=out.status,
        seconds_left=out.seconds_left,
        movie_title=show.title if show else None,
        hall=show.name if show else None,
        start_time=show.start_time if show else None,
        seats=[f"{t.row_label}{t.seat_number}" for t in out.tickets],
    )


@router.post("/bookings/{booking_id}/kaspi-invoice", response_model=InvoiceOut)
def create_kaspi_invoice(booking_id: int, user: CurrentUserDep, db: SessionDep) -> InvoiceOut:
    """A payment link for my pending booking, to show as a QR code. Asking again reuses it."""
    expire_stale_holds(db)
    booking = _own_booking(db, user, booking_id, lock=True)
    ensure_payable(db, booking)
    if booking.payment_token is None:
        booking.payment_token = secrets.token_urlsafe(PAYMENT_TOKEN_BYTES)
    db.commit()
    out = _booking_out(db, booking)
    return InvoiceOut(
        booking_id=booking.booking_id,
        payment_token=booking.payment_token,
        pay_path=f"/fake-kaspi/{booking.payment_token}",
        amount=out.total_amount,
        seconds_left=out.seconds_left,
    )


@router.get("/fake-kaspi/{token}", response_model=FakeKaspiOut)
def get_fake_kaspi_invoice(token: str, db: SessionDep) -> FakeKaspiOut:
    """What the phone shows: merchant, amount, show and seats. No login; no personal data."""
    expire_stale_holds(db)
    return _page(db, _by_token(db, token))


@router.post("/fake-kaspi/{token}/pay", response_model=FakeKaspiOut)
def pay_fake_kaspi_invoice(token: str, body: FakePayIn, db: SessionDep) -> FakeKaspiOut:
    """Pay (or decline) from the phone. Paying a booking that is already paid changes nothing."""
    expire_stale_holds(db)
    booking = _by_token(db, token, lock=True)
    if booking.status != "paid":
        settle_payment(db, booking, "kaspi", decline=body.decline)
    else:
        db.rollback()
    return _page(db, booking)
