"""Rules from the second migration (booking, payment and audit tables)."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Booking, Customer, Hall, Movie, Payment, Screening, Seat, Ticket, TicketType

START = datetime(2030, 1, 1, 18, 0, tzinfo=UTC)


@pytest.fixture
def setup(db: Session) -> dict:
    user_id = uuid.uuid4()
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, 'a@test.kz')"), {"id": user_id}
    )
    customer = Customer(auth_user_id=user_id, full_name="Test Customer", email="a@test.kz")
    hall = Hall(name="Test hall", hall_type="2D")
    movie = Movie(title="Test movie", duration_min=100, min_age=0)
    adult = TicketType(name="test-adult")
    db.add_all([customer, hall, movie, adult])
    db.flush()
    seat = Seat(hall_id=hall.hall_id, row_label="A", seat_number=1, grid_row=1, grid_col=1)
    screening = Screening(
        hall_id=hall.hall_id,
        movie_id=movie.movie_id,
        start_time=START,
        end_time=START + timedelta(minutes=115),
        base_price=Decimal("2500.00"),
    )
    db.add_all([seat, screening])
    db.flush()
    return {"customer": customer, "seat": seat, "screening": screening, "type": adult}


def _book(db: Session, s: dict) -> Booking:
    booking = Booking(customer_id=s["customer"].customer_id)
    db.add(booking)
    db.flush()
    db.add(
        Ticket(
            booking_id=booking.booking_id,
            screening_id=s["screening"].screening_id,
            seat_id=s["seat"].seat_id,
            ticket_type_id=s["type"].ticket_type_id,
            price=Decimal("2500.00"),
        )
    )
    db.flush()
    return booking


def test_a_free_seat_can_be_booked(db: Session, setup: dict):
    booking = _book(db, setup)
    db.refresh(booking)
    assert booking.status == "pending"
    assert booking.hold_expires_at > booking.booking_time


def test_the_same_seat_cannot_be_booked_twice(db: Session, setup: dict):
    _book(db, setup)
    with pytest.raises(IntegrityError, match="ticket_seat_taken"):
        _book(db, setup)


def test_only_one_successful_payment_per_booking(db: Session, setup: dict):
    booking = _book(db, setup)
    for _ in range(2):
        db.add(
            Payment(
                booking_id=booking.booking_id,
                amount=Decimal("2500"),
                method="card",
                status="success",
            )
        )
    with pytest.raises(IntegrityError, match="payment_one_success_idx"):
        db.flush()


def test_a_booking_needs_a_customer_or_a_cashier(db: Session):
    db.add(Booking())
    with pytest.raises(IntegrityError):
        db.flush()
