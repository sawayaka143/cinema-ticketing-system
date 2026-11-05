"""GET /api/me/bookings: the customer's own bookings, newest first."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text, update
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.main import app
from app.models import Booking, Customer, Hall, Movie, Screening, Seat


def _login(db: Session, email: str, *, profile: bool = True) -> CurrentUser:
    user = CurrentUser(id=uuid.uuid4(), email=email)
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
        {"id": user.id, "email": email},
    )
    if profile:
        db.add(Customer(auth_user_id=user.id, full_name="Test", email=email))
        db.flush()
    app.dependency_overrides[get_current_user] = lambda: user
    return user


@pytest.fixture
def show(db: Session) -> dict:
    hall = Hall(name="Test hall", hall_type="2D")
    movie = Movie(title="Test movie", duration_min=100, min_age=0)
    db.add_all([hall, movie])
    db.flush()
    seats = [
        Seat(hall_id=hall.hall_id, row_label="A", seat_number=n, grid_row=1, grid_col=n)
        for n in (1, 2, 3)
    ]
    start = datetime.now(UTC) + timedelta(days=1)
    screening = Screening(
        movie_id=movie.movie_id,
        hall_id=hall.hall_id,
        start_time=start,
        end_time=start + timedelta(minutes=115),
        base_price=Decimal("2000.00"),
    )
    db.add_all([*seats, screening])
    db.flush()
    return {"screening": screening, "seats": seats}


def _hold(client: TestClient, show: dict, *idx: int) -> int:
    res = client.post(
        "/api/bookings",
        json={
            "screening_id": show["screening"].screening_id,
            "seat_ids": [show["seats"][i].seat_id for i in idx],
        },
    )
    assert res.status_code == 201
    return res.json()["booking_id"]


def test_lists_my_bookings_newest_first(client: TestClient, db: Session, show: dict):
    _login(db, "me@test.kz")
    first = _hold(client, show, 0)
    client.post(f"/api/bookings/{first}/pay", json={"method": "card"})
    second = _hold(client, show, 1, 2)

    res = client.get("/api/me/bookings")

    assert res.status_code == 200
    rows = res.json()
    assert [r["booking_id"] for r in rows] == [second, first]
    assert (rows[0]["status"], len(rows[0]["tickets"]), rows[0]["total_amount"]) == (
        "pending",
        2,
        "4000.00",
    )
    assert (rows[1]["status"], rows[1]["movie_title"], rows[1]["hall"]) == (
        "paid",
        "Test movie",
        "Test hall",
    )
    assert rows[1]["qr_token"]
    assert rows[1]["start_time"] is not None


def test_status_filter(client: TestClient, db: Session, show: dict):
    _login(db, "me@test.kz")
    paid = _hold(client, show, 0)
    client.post(f"/api/bookings/{paid}/pay", json={"method": "card"})
    _hold(client, show, 1)

    rows = client.get("/api/me/bookings", params={"status": "paid"}).json()

    assert [r["booking_id"] for r in rows] == [paid]


def test_stale_hold_shows_as_expired(client: TestClient, db: Session, show: dict):
    _login(db, "me@test.kz")
    booking_id = _hold(client, show, 0)
    db.execute(
        update(Booking)
        .where(Booking.booking_id == booking_id)
        .values(hold_expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )

    row = client.get("/api/me/bookings").json()[0]

    assert (row["status"], row["tickets"], row["movie_title"]) == ("expired", [], None)


def test_other_customers_bookings_are_hidden(client: TestClient, db: Session, show: dict):
    _login(db, "other@test.kz")
    _hold(client, show, 0)
    _login(db, "me@test.kz")

    assert client.get("/api/me/bookings").json() == []


def test_login_without_profile_gets_empty_list(client: TestClient, db: Session):
    _login(db, "new@test.kz", profile=False)
    assert client.get("/api/me/bookings").json() == []


def test_bad_status_filter_is_422(client: TestClient, db: Session):
    _login(db, "me@test.kz")
    assert client.get("/api/me/bookings", params={"status": "lost"}).status_code == 422


def test_without_login_is_401(client: TestClient):
    assert client.get("/api/me/bookings").status_code == 401
