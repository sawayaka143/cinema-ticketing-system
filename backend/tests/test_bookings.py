"""Hold expiry (expire_stale_holds) and /api/bookings: countdown and customer cancel.

Token verification is mocked, the database is real (each test is rolled back).
"""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.bookings import expire_stale_holds
from app.auth import CurrentUser, get_current_user
from app.main import app
from app.models import Booking, Customer, Hall, Movie, Screening, Seat, Ticket, TicketType

START = datetime(2030, 1, 1, 18, 0, tzinfo=UTC)


def _customer(db: Session, email: str) -> tuple[CurrentUser, Customer]:
    user = CurrentUser(id=uuid.uuid4(), email=email)
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
        {"id": user.id, "email": email},
    )
    customer = Customer(auth_user_id=user.id, full_name="Test Customer", email=email)
    db.add(customer)
    db.flush()
    return user, customer


@pytest.fixture
def world(db: Session) -> dict:
    """Two customers, one hall with three seats, two screenings, one ticket type."""
    me, my_customer = _customer(db, "me@test.kz")
    _, other_customer = _customer(db, "other@test.kz")
    hall = Hall(name="Test hall", hall_type="2D")
    movie = Movie(title="Test movie", duration_min=100, min_age=0)
    adult = TicketType(name="test-adult")
    db.add_all([hall, movie, adult])
    db.flush()
    seats = [
        Seat(hall_id=hall.hall_id, row_label="A", seat_number=n, grid_row=1, grid_col=n)
        for n in (1, 2, 3)
    ]
    screenings = [
        Screening(
            movie_id=movie.movie_id,
            hall_id=hall.hall_id,
            start_time=START + timedelta(hours=3 * i),
            end_time=START + timedelta(hours=3 * i + 2),
            base_price=Decimal("2000.00"),
        )
        for i in (0, 1)
    ]
    db.add_all(seats + screenings)
    db.flush()
    return {
        "me": me,
        "my_customer": my_customer,
        "other_customer": other_customer,
        "seats": seats,
        "screenings": screenings,
        "adult": adult,
    }


@pytest.fixture
def make_booking(db: Session, world: dict) -> Callable[..., Booking]:
    def _make(
        *,
        customer: Customer | None = None,
        status: str = "pending",
        expires_in: timedelta = timedelta(minutes=10),
        seats: tuple[int, ...] = (0,),
        screening: int = 0,
    ) -> Booking:
        booking = Booking(
            customer_id=(customer or world["my_customer"]).customer_id,
            status=status,
            hold_expires_at=datetime.now(UTC) + expires_in,
        )
        db.add(booking)
        db.flush()
        db.add_all(
            Ticket(
                booking_id=booking.booking_id,
                screening_id=world["screenings"][screening].screening_id,
                seat_id=world["seats"][i].seat_id,
                ticket_type_id=world["adult"].ticket_type_id,
                price=Decimal("2000.00"),
            )
            for i in seats
        )
        db.flush()
        return booking

    return _make


@pytest.fixture
def as_me(world: dict) -> CurrentUser:
    app.dependency_overrides[get_current_user] = lambda: world["me"]
    return world["me"]


def _tickets(db: Session, booking: Booking) -> int:
    return db.scalar(
        select(func.count()).select_from(Ticket).where(Ticket.booking_id == booking.booking_id)
    )


def _status(db: Session, booking: Booking) -> str:
    return db.scalar(select(Booking.status).where(Booking.booking_id == booking.booking_id))


# --- expire_stale_holds() -------------------------------------------------------------------


def test_stale_hold_expires_and_frees_its_seats(db: Session, world, make_booking):
    stale = make_booking(seats=(0, 1), expires_in=timedelta(minutes=-1))

    assert expire_stale_holds(db) >= 1

    assert _status(db, stale) == "expired"
    assert _tickets(db, stale) == 0
    # The seats can be held again by someone else (BOOK-05).
    again = make_booking(customer=world["other_customer"], seats=(0, 1))
    assert _tickets(db, again) == 2


def test_fresh_hold_and_paid_booking_are_untouched(db: Session, make_booking):
    fresh = make_booking(seats=(0,))
    paid = make_booking(seats=(1,), status="paid", expires_in=timedelta(minutes=-30))

    expire_stale_holds(db)

    assert (_status(db, fresh), _tickets(db, fresh)) == ("pending", 1)
    assert (_status(db, paid), _tickets(db, paid)) == ("paid", 1)


def test_screening_filter_only_expires_that_screening(db: Session, world, make_booking):
    first = make_booking(seats=(0,), screening=0, expires_in=timedelta(minutes=-1))
    second = make_booking(seats=(0,), screening=1, expires_in=timedelta(minutes=-1))

    assert expire_stale_holds(db, world["screenings"][1].screening_id) == 1

    assert _status(db, first) == "pending"
    assert _status(db, second) == "expired"


# --- GET /api/bookings/{id} -----------------------------------------------------------------


def test_get_booking_shows_countdown(client: TestClient, as_me, make_booking):
    booking = make_booking(seats=(0, 1))

    res = client.get(f"/api/bookings/{booking.booking_id}")

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "pending"
    assert 590 <= body["seconds_left"] <= 600
    assert body["total_amount"] == "4000.00"
    assert [(t["row_label"], t["seat_number"]) for t in body["tickets"]] == [("A", 1), ("A", 2)]


def test_get_stale_booking_is_expired_lazily(client: TestClient, as_me, make_booking):
    booking = make_booking(expires_in=timedelta(minutes=-1))

    body = client.get(f"/api/bookings/{booking.booking_id}").json()

    assert (body["status"], body["seconds_left"], body["tickets"]) == ("expired", 0, [])


def test_get_someone_elses_booking_is_404(client: TestClient, world, as_me, make_booking):
    theirs = make_booking(customer=world["other_customer"])

    assert client.get(f"/api/bookings/{theirs.booking_id}").status_code == 404
    assert client.get("/api/bookings/999999999").status_code == 404


def test_get_booking_without_login_is_401(client: TestClient, make_booking):
    booking = make_booking()

    assert client.get(f"/api/bookings/{booking.booking_id}").status_code == 401


# --- POST /api/bookings/{id}/cancel ---------------------------------------------------------


def test_cancel_pending_hold_frees_seats(client: TestClient, db: Session, as_me, make_booking):
    booking = make_booking(seats=(0, 1))

    res = client.post(f"/api/bookings/{booking.booking_id}/cancel")

    assert res.status_code == 200
    assert (res.json()["status"], res.json()["tickets"]) == ("cancelled", [])
    assert _status(db, booking) == "cancelled"
    assert _tickets(db, booking) == 0


def test_cancel_paid_booking_is_409(client: TestClient, db: Session, as_me, make_booking):
    booking = make_booking(status="paid")

    res = client.post(f"/api/bookings/{booking.booking_id}/cancel")

    assert res.status_code == 409
    assert _status(db, booking) == "paid"
    assert _tickets(db, booking) == 1


def test_cancel_expired_hold_is_409(client: TestClient, as_me, make_booking):
    booking = make_booking(expires_in=timedelta(minutes=-1))

    res = client.post(f"/api/bookings/{booking.booking_id}/cancel")

    assert res.status_code == 409
    assert res.json()["detail"] == "The hold has expired"


def test_cancel_someone_elses_booking_is_404(
    client: TestClient, db: Session, world, as_me, make_booking
):
    theirs = make_booking(customer=world["other_customer"])

    assert client.post(f"/api/bookings/{theirs.booking_id}/cancel").status_code == 404
    assert _status(db, theirs) == "pending"


def test_cancel_without_login_is_401(client: TestClient, make_booking):
    booking = make_booking()

    assert client.post(f"/api/bookings/{booking.booking_id}/cancel").status_code == 401
