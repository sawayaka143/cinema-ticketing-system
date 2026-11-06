"""A customer's own bookings: hold seats for 10 minutes, pay (fake), countdown, cancel.

Expiry follows docs/schema-decisions.md §6: the SQL function expire_stale_holds() turns
pending bookings past hold_expires_at into 'expired' and deletes their tickets. pg_cron runs
it every minute; the endpoints here also run it first (the lazy check), so a client never
sees a hold that should already have ended.
"""

import io
import secrets
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Literal

import segno
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import CurrentUser, CurrentUserDep, OptionalUserDep
from app.db import get_session
from app.models import (
    Booking,
    Customer,
    Hall,
    Movie,
    Payment,
    Screening,
    Seat,
    Ticket,
    TicketType,
)
from app.pricing import ticket_price
from app.ticket_types import (
    DEFAULT_TYPE,
    MAX_STAFF_TICKETS,
    age_problem,
    choosable,
    is_active_staff,
)

router = APIRouter(tags=["bookings"])

SessionDep = Annotated[Session, Depends(get_session)]

MAX_SEATS = 10
QR_TOKEN_BYTES = 18  # 144 random bits = 24 URL-safe characters: unguessable, still a small QR


class BookingTicketOut(BaseModel):
    ticket_id: int
    screening_id: int
    seat_id: int
    row_label: str
    seat_number: int
    ticket_type: str
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
    qr_token: str | None = Field(
        description="Set once paid: one QR code for all seats. Image: GET .../qr.png"
    )
    checked_in_at: datetime | None


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
        select(Ticket, Seat, TicketType.name)
        .join(Seat, Seat.seat_id == Ticket.seat_id)
        .join(TicketType, TicketType.ticket_type_id == Ticket.ticket_type_id)
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
            ticket_type=type_name,
            price=t.price,
        )
        for t, s, type_name in rows
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
        qr_token=booking.qr_token if booking.status == "paid" else None,
        checked_in_at=booking.checked_in_at,
    )


class HoldIn(BaseModel):
    screening_id: int
    seat_ids: list[int] = Field(
        description=f"1 to {MAX_SEATS} distinct seats of the screening's hall"
    )
    ticket_types: dict[int, str] = Field(
        default={},
        description="seat_id -> ticket type name (student, child, staff). Others are adult.",
        examples=[{"523": "child"}],
    )


class TicketTypeOut(BaseModel):
    name: str
    discount_pct: Decimal
    max_age: int | None
    staff_only: bool


class PayIn(BaseModel):
    method: Literal["card", "kaspi"]
    simulate_decline: bool = Field(
        default=False, description="Fake provider: true makes this attempt fail (for demos/tests)."
    )


def _my_customer(db: Session, user: CurrentUser) -> Customer:
    customer = db.scalar(select(Customer).where(Customer.auth_user_id == user.id))
    if customer is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Create a customer profile first")
    return customer


def _ticket_types_for(
    db: Session, user: CurrentUser, body: HoldIn, screening: Screening
) -> dict[int, TicketType]:
    """seat_id -> TicketType for the hold, enforcing the §7 rules (400/403)."""
    stray = set(body.ticket_types) - set(body.seat_ids)
    if stray:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "ticket_types names a seat not in seat_ids"
        )
    types = {t.name: t for t in db.scalars(select(TicketType))}
    if DEFAULT_TYPE not in types:
        raise RuntimeError(f"ticket type {DEFAULT_TYPE!r} is missing; run the migrations")
    names = {seat_id: body.ticket_types.get(seat_id, DEFAULT_TYPE) for seat_id in body.seat_ids}
    unknown = sorted(set(names.values()) - set(types))
    if unknown:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown ticket type: {unknown[0]}")

    min_age = db.scalar(select(Movie.min_age).where(Movie.movie_id == screening.movie_id))
    used = {types[n] for n in names.values()}
    for t in used:
        problem = age_problem(t, min_age)
        if problem:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, problem)
    staff_tickets = sum(types[n].staff_only for n in names.values())
    if staff_tickets:
        if not is_active_staff(db, user):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Staff tickets are for active staff only"
            )
        if staff_tickets > MAX_STAFF_TICKETS:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"At most {MAX_STAFF_TICKETS} staff tickets per booking",
            )
    return {seat_id: types[name] for seat_id, name in names.items()}


@router.get("/ticket-types", response_model=list[TicketTypeOut])
def list_ticket_types(
    user: OptionalUserDep,
    db: SessionDep,
    screening_id: Annotated[
        int | None, Query(description="Only the types allowed for this screening's movie")
    ] = None,
) -> list[TicketTypeOut]:
    """Price categories a customer may choose. Staff types only for logged-in active staff."""
    min_age = 0
    if screening_id is not None:
        min_age = db.scalar(
            select(Movie.min_age)
            .join(Screening, Screening.movie_id == Movie.movie_id)
            .where(Screening.screening_id == screening_id)
        )
        if min_age is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Screening not found")
    return [
        TicketTypeOut.model_validate(t, from_attributes=True)
        for t in choosable(db, min_age, is_active_staff(db, user))
    ]


@router.post("/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def hold_seats(body: HoldIn, user: CurrentUserDep, db: SessionDep) -> BookingOut:
    """Hold seats for 10 minutes: a pending booking with one ticket per seat (§6, step 1)."""
    customer = _my_customer(db, user)
    ids = body.seat_ids
    if not 1 <= len(ids) <= MAX_SEATS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Pick 1 to {MAX_SEATS} seats")
    if len(set(ids)) != len(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A seat is listed twice")

    screening = db.get(Screening, body.screening_id)
    if screening is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Screening not found")
    if screening.start_time <= datetime.now(UTC):
        raise HTTPException(status.HTTP_409_CONFLICT, "The screening has already started")
    seats = db.scalars(
        select(Seat).where(Seat.seat_id.in_(ids), Seat.hall_id == screening.hall_id)
    ).all()
    if len(seats) != len(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A seat is not in this screening's hall")
    chosen = _ticket_types_for(db, user, body, screening)

    # Plain values first: the commit in the lazy check expires the ORM objects above.
    rows = [
        (
            seat.seat_id,
            chosen[seat.seat_id].ticket_type_id,
            ticket_price(screening.base_price, seat.seat_type, chosen[seat.seat_id].discount_pct),
        )
        for seat in seats
    ]
    screening_id, customer_id = screening.screening_id, customer.customer_id

    expire_stale_holds(db, screening_id)  # lazy check: frees stale holds first
    booking = Booking(customer_id=customer_id)
    try:
        db.add(booking)
        db.flush()
        db.add_all(
            [
                Ticket(
                    booking_id=booking.booking_id,
                    screening_id=screening_id,
                    seat_id=seat_id,
                    ticket_type_id=type_id,
                    price=price,
                )
                for seat_id, type_id, price in rows
            ]
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "ticket_seat_taken" not in str(exc.orig):
            raise
        raise HTTPException(status.HTTP_409_CONFLICT, "A seat is already taken") from exc
    db.refresh(booking)
    return _booking_out(db, booking)


@router.post("/bookings/{booking_id}/pay", response_model=BookingOut)
def pay_booking(booking_id: int, body: PayIn, user: CurrentUserDep, db: SessionDep) -> BookingOut:
    """Fake payment for my pending hold (§6, step 2). A decline is stored; retry is allowed."""
    expire_stale_holds(db)
    booking = _own_booking(db, user, booking_id, lock=True)
    if booking.status == "expired" or (
        booking.status == "pending" and booking.hold_expires_at <= datetime.now(UTC)
    ):
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "The hold has expired")
    if booking.status != "pending":
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"The booking is already {booking.status}")

    amount = db.scalar(
        text("SELECT total_amount FROM booking_total WHERE booking_id = :id"),
        {"id": booking.booking_id},
    )
    payment = Payment(
        booking_id=booking.booking_id,
        amount=amount,
        method=body.method,
        status="failed" if body.simulate_decline else "success",
        provider_ref=f"FAKE-{secrets.token_hex(6)}",
    )
    db.add(payment)
    if body.simulate_decline:
        db.commit()
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED, "Payment declined. Try again before the hold expires"
        )
    payment.paid_at = func.now()
    booking.status = "paid"
    booking.qr_token = secrets.token_urlsafe(QR_TOKEN_BYTES)
    db.commit()
    return _booking_out(db, booking)


@router.get(
    "/bookings/{booking_id}/qr.png",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}, "description": "The QR code as PNG"}},
)
def get_booking_qr(booking_id: int, user: CurrentUserDep, db: SessionDep) -> Response:
    """The QR code of my paid booking. One code lets the whole group in."""
    booking = _own_booking(db, user, booking_id)
    if booking.status != "paid" or booking.qr_token is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a paid booking has a QR code")
    out = io.BytesIO()
    segno.make_qr(booking.qr_token, error="m").save(out, kind="png", scale=8, border=4)
    return Response(
        out.getvalue(), media_type="image/png", headers={"Cache-Control": "private, no-store"}
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


class MyBookingOut(BookingOut):
    movie_title: str | None = Field(description="Null once the tickets are gone (cancel/expiry)")
    hall: str | None
    start_time: datetime | None


BookingStatus = Literal["pending", "paid", "cancelled", "expired"]


@router.get("/me/bookings", response_model=list[MyBookingOut])
def my_bookings(
    user: CurrentUserDep,
    db: SessionDep,
    status_filter: Annotated[BookingStatus | None, Query(alias="status")] = None,
) -> list[MyBookingOut]:
    """All my bookings, newest first, with the movie and time (for the "My bookings" page)."""
    expire_stale_holds(db)
    query = (
        select(Booking)
        .join(Customer, Customer.customer_id == Booking.customer_id)
        .where(Customer.auth_user_id == user.id)
        .order_by(Booking.booking_time.desc(), Booking.booking_id.desc())
    )
    if status_filter is not None:
        query = query.where(Booking.status == status_filter)
    result = []
    for booking in db.scalars(query).all():
        out = _booking_out(db, booking)
        show = None
        if out.tickets:
            show = db.execute(
                select(Movie.title, Hall.name, Screening.start_time)
                .join(Screening, Screening.movie_id == Movie.movie_id)
                .join(Hall, Hall.hall_id == Screening.hall_id)
                .where(Screening.screening_id == out.tickets[0].screening_id)
            ).one()
        result.append(
            MyBookingOut(
                **out.model_dump(),
                movie_title=show.title if show else None,
                hall=show.name if show else None,
                start_time=show.start_time if show else None,
            )
        )
    return result
