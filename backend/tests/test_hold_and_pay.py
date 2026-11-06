"""Seat map, hold (POST /api/bookings) and fake payment: BOOK-01 to BOOK-04 in docs/test-cases.md.

Token verification is mocked, the database is real (each test is rolled back).
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.main import app
from app.models import Booking, Customer, Hall, Movie, Payment, Screening, Seat
from app.pricing import ticket_price


def _login(db: Session, email: str, *, with_profile: bool = True) -> CurrentUser:
    user = CurrentUser(id=uuid.uuid4(), email=email)
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
        {"id": user.id, "email": email},
    )
    if with_profile:
        db.add(Customer(auth_user_id=user.id, full_name="Test Customer", email=email))
        db.flush()
    return user


def _act_as(user: CurrentUser) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.fixture
def show(db: Session) -> dict:
    """A future screening: hall with A1, A2 (standard) and B1 (vip); one seat in another hall."""
    hall, other = Hall(name="Test hall", hall_type="2D"), Hall(name="Other hall", hall_type="3D")
    movie = Movie(title="Test movie", duration_min=100, min_age=0)
    db.add_all([hall, other, movie])
    db.flush()
    seats = [
        Seat(hall_id=hall.hall_id, row_label="A", seat_number=1, grid_row=1, grid_col=1),
        Seat(hall_id=hall.hall_id, row_label="A", seat_number=2, grid_row=1, grid_col=2),
        Seat(
            hall_id=hall.hall_id,
            row_label="B",
            seat_number=1,
            grid_row=2,
            grid_col=1,
            seat_type="vip",
        ),
    ]
    foreign = Seat(hall_id=other.hall_id, row_label="A", seat_number=1, grid_row=1, grid_col=1)
    start = datetime.now(UTC) + timedelta(days=1)
    screening = Screening(
        movie_id=movie.movie_id,
        hall_id=hall.hall_id,
        start_time=start,
        end_time=start + timedelta(minutes=115),
        base_price=Decimal("2000.00"),
    )
    db.add_all([*seats, foreign, screening])
    db.flush()
    return {"seats": seats, "foreign": foreign, "screening": screening}


@pytest.fixture
def me(db: Session) -> CurrentUser:
    user = _login(db, "me@test.kz")
    _act_as(user)
    return user


def _hold(client: TestClient, show: dict, *seat_indexes: int):
    return client.post(
        "/api/bookings",
        json={
            "screening_id": show["screening"].screening_id,
            "seat_ids": [show["seats"][i].seat_id for i in seat_indexes],
        },
    )


# --- pricing -----------------------------------------------------------------------------------


def test_ticket_price_rule():
    assert ticket_price(Decimal("2000.00"), "standard") == Decimal("2000.00")
    assert ticket_price(Decimal("2000.00"), "vip") == Decimal("3000.00")
    assert ticket_price(Decimal("2500.00"), "vip", Decimal("33.33")) == Decimal("2500.13")


# --- GET /api/screenings/{id}/seats ------------------------------------------------------------


def test_seat_map_marks_taken_seats_and_prices(client: TestClient, me, show):
    _hold(client, show, 0)

    res = client.get(f"/api/screenings/{show['screening'].screening_id}/seats")

    assert res.status_code == 200
    seats = {(s["row_label"], s["seat_number"]): s for s in res.json()["seats"]}
    assert set(seats) == {("A", 1), ("A", 2), ("B", 1)}  # the other hall's seat isn't listed
    assert (seats[("A", 1)]["is_taken"], seats[("A", 2)]["is_taken"]) == (True, False)
    assert seats[("B", 1)]["price"] == "3000.00"


def test_seat_map_of_unknown_screening_is_404(client: TestClient):
    assert client.get("/api/screenings/999999999/seats").status_code == 404


# --- POST /api/bookings (hold) -----------------------------------------------------------------


def test_hold_free_seats(client: TestClient, me, show):  # BOOK-01
    res = _hold(client, show, 0, 2)

    assert res.status_code == 201
    body = res.json()
    assert body["status"] == "pending"
    assert 590 <= body["seconds_left"] <= 600
    assert body["total_amount"] == "5000.00"  # 2000 standard + 3000 vip
    assert len(body["tickets"]) == 2


def test_hold_taken_seat_is_409_and_rolls_back(client: TestClient, db: Session, me, show):
    _hold(client, show, 0)  # BOOK-02: someone else holds A1 ...
    _act_as(_login(db, "second@test.kz"))

    res = _hold(client, show, 1, 0)  # ... and A2 + A1 is requested

    assert res.status_code == 409
    assert (
        db.scalar(
            select(Booking.booking_id)
            .join(Customer, Customer.customer_id == Booking.customer_id)
            .where(Customer.email == "second@test.kz")
        )
        is None
    )


def test_stale_hold_frees_its_seat_for_the_next_hold(client: TestClient, db: Session, me, show):
    first = _hold(client, show, 0).json()
    db.execute(
        update(Booking)
        .where(Booking.booking_id == first["booking_id"])
        .values(hold_expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )
    _act_as(_login(db, "second@test.kz"))

    assert _hold(client, show, 0).status_code == 201  # BOOK-05, lazy check


@pytest.mark.parametrize(
    "seat_ids",
    [[], "dupe", "foreign", list(range(1, 12))],
    ids=["empty", "duplicate", "other-hall", "too-many"],
)
def test_hold_bad_seat_list_is_400(client: TestClient, me, show, seat_ids):
    if seat_ids == "dupe":
        seat_ids = [show["seats"][0].seat_id] * 2
    elif seat_ids == "foreign":
        seat_ids = [show["foreign"].seat_id]
    res = client.post(
        "/api/bookings",
        json={"screening_id": show["screening"].screening_id, "seat_ids": seat_ids},
    )
    assert res.status_code == 400


def test_hold_for_started_screening_is_409(client: TestClient, db: Session, me, show):
    db.execute(
        update(Screening)
        .where(Screening.screening_id == show["screening"].screening_id)
        .values(
            start_time=datetime.now(UTC) - timedelta(minutes=5),
            end_time=datetime.now(UTC) + timedelta(minutes=100),
        )
    )
    db.expire_all()
    assert _hold(client, show, 0).status_code == 409


def test_hold_unknown_screening_is_404(client: TestClient, me):
    res = client.post("/api/bookings", json={"screening_id": 999999999, "seat_ids": [1]})
    assert res.status_code == 404


def test_hold_without_customer_profile_is_403(client: TestClient, db: Session, show):
    _act_as(_login(db, "noprofile@test.kz", with_profile=False))
    assert _hold(client, show, 0).status_code == 403


def test_hold_without_login_is_401(client: TestClient, show):
    assert _hold(client, show, 0).status_code == 401


# --- POST /api/bookings/{id}/pay ---------------------------------------------------------------


def _pay(client: TestClient, booking_id: int, decline: bool = False):
    return client.post(
        f"/api/bookings/{booking_id}/pay", json={"method": "card", "simulate_decline": decline}
    )


def test_pay_success_marks_booking_paid(client: TestClient, db: Session, me, show):  # BOOK-03
    booking_id = _hold(client, show, 0, 1).json()["booking_id"]

    res = _pay(client, booking_id)

    assert res.status_code == 200
    assert (res.json()["status"], len(res.json()["tickets"])) == ("paid", 2)
    payment = db.scalar(select(Payment).where(Payment.booking_id == booking_id))
    assert (payment.status, payment.amount) == ("success", Decimal("4000.00"))
    assert payment.paid_at is not None
    assert payment.provider_ref.startswith("FAKE-")


def test_declined_payment_is_402_and_can_be_retried(client: TestClient, db: Session, me, show):
    booking_id = _hold(client, show, 0).json()["booking_id"]

    assert _pay(client, booking_id, decline=True).status_code == 402
    assert _pay(client, booking_id).status_code == 200
    statuses = db.scalars(
        select(Payment.status).where(Payment.booking_id == booking_id).order_by(Payment.payment_id)
    ).all()
    assert statuses == ["failed", "success"]


def test_pay_expired_hold_is_409(client: TestClient, db: Session, me, show):  # BOOK-04
    booking_id = _hold(client, show, 0).json()["booking_id"]
    db.execute(
        update(Booking)
        .where(Booking.booking_id == booking_id)
        .values(hold_expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )

    res = _pay(client, booking_id)

    assert res.status_code == 409
    assert db.scalar(select(Payment).where(Payment.booking_id == booking_id)) is None
    body = client.get(f"/api/bookings/{booking_id}").json()
    assert (body["status"], body["tickets"]) == ("expired", [])


def test_pay_twice_is_409(client: TestClient, me, show):
    booking_id = _hold(client, show, 0).json()["booking_id"]
    _pay(client, booking_id)
    assert _pay(client, booking_id).status_code == 409


def test_pay_someone_elses_booking_is_404(client: TestClient, db: Session, me, show):
    booking_id = _hold(client, show, 0).json()["booking_id"]
    _act_as(_login(db, "second@test.kz"))
    assert _pay(client, booking_id).status_code == 404
