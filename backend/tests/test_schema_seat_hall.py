"""Seat-hall trigger (migration 0004): a ticket's seat must be in its screening's hall."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Booking, Customer, Hall, Movie, Screening, Seat, Ticket, TicketType

START = datetime(2030, 1, 1, 18, 0, tzinfo=UTC)


@pytest.fixture
def two_halls(db: Session) -> dict:
    user_id = uuid.uuid4()
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, 'h@test.kz')"), {"id": user_id}
    )
    customer = Customer(auth_user_id=user_id, full_name="Test Customer", email="h@test.kz")
    halls = [Hall(name="Test hall A", hall_type="2D"), Hall(name="Test hall B", hall_type="2D")]
    movie = Movie(title="Test movie", duration_min=100, min_age=0)
    adult = TicketType(name="test-adult")
    db.add_all([customer, movie, adult, *halls])
    db.flush()
    seats = [
        Seat(hall_id=h.hall_id, row_label="A", seat_number=1, grid_row=1, grid_col=1) for h in halls
    ]
    screening = Screening(
        movie_id=movie.movie_id,
        hall_id=halls[0].hall_id,
        start_time=START,
        end_time=START + timedelta(minutes=115),
        base_price=Decimal("2000.00"),
    )
    db.add_all([*seats, screening])
    db.flush()
    booking = Booking(customer_id=customer.customer_id)
    db.add(booking)
    db.flush()
    return {
        "halls": halls,
        "seat_a": seats[0],
        "seat_b": seats[1],
        "screening": screening,
        "booking": booking,
        "type": adult,
    }


def _ticket(db: Session, w: dict, seat: Seat) -> Ticket:
    ticket = Ticket(
        booking_id=w["booking"].booking_id,
        screening_id=w["screening"].screening_id,
        seat_id=seat.seat_id,
        ticket_type_id=w["type"].ticket_type_id,
        price=Decimal("2000.00"),
    )
    db.add(ticket)
    db.flush()
    return ticket


def test_seat_from_the_screenings_hall_is_accepted(db: Session, two_halls: dict):
    ticket = _ticket(db, two_halls, two_halls["seat_a"])
    assert ticket.ticket_id is not None


def test_seat_from_another_hall_is_rejected(db: Session, two_halls: dict):
    with pytest.raises(IntegrityError, match="is not in the hall of screening"):
        _ticket(db, two_halls, two_halls["seat_b"])


def test_moving_a_ticket_to_another_halls_seat_is_rejected(db: Session, two_halls: dict):
    ticket = _ticket(db, two_halls, two_halls["seat_a"])
    with pytest.raises(IntegrityError, match="is not in the hall of screening"):
        db.execute(
            update(Ticket)
            .where(Ticket.ticket_id == ticket.ticket_id)
            .values(seat_id=two_halls["seat_b"].seat_id)
        )


def test_seat_with_tickets_cannot_change_hall(db: Session, two_halls: dict):
    _ticket(db, two_halls, two_halls["seat_a"])
    with pytest.raises(IntegrityError, match="seat already has tickets"):
        db.execute(
            update(Seat)
            .where(Seat.seat_id == two_halls["seat_a"].seat_id)
            .values(hall_id=two_halls["halls"][1].hall_id, grid_col=2)
        )


def test_screening_with_tickets_cannot_change_hall(db: Session, two_halls: dict):
    _ticket(db, two_halls, two_halls["seat_a"])
    with pytest.raises(IntegrityError, match="screening already has tickets"):
        db.execute(
            update(Screening)
            .where(Screening.screening_id == two_halls["screening"].screening_id)
            .values(hall_id=two_halls["halls"][1].hall_id)
        )


def test_screening_without_tickets_can_change_hall(db: Session, two_halls: dict):
    db.execute(
        update(Screening)
        .where(Screening.screening_id == two_halls["screening"].screening_id)
        .values(hall_id=two_halls["halls"][1].hall_id)
    )
    db.refresh(two_halls["screening"])
    assert two_halls["screening"].hall_id == two_halls["halls"][1].hall_id
