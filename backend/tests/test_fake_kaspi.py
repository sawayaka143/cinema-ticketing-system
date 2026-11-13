"""Demo Kaspi QR payment: invoice token, the public pay page and paying from the phone."""

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


def _login(db: Session, email: str) -> CurrentUser:
    user = CurrentUser(id=uuid.uuid4(), email=email)
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
        {"id": user.id, "email": email},
    )
    db.add(Customer(auth_user_id=user.id, full_name="Secret Name", email=email))
    db.flush()
    app.dependency_overrides[get_current_user] = lambda: user
    return user


@pytest.fixture
def held(client: TestClient, db: Session) -> dict:
    """A pending hold of A1 + A2 (4000 ₸) and its Kaspi invoice."""
    _login(db, "buyer@test.kz")
    hall = Hall(name="Test hall", hall_type="2D")
    movie = Movie(title="Test movie", duration_min=100, min_age=0)
    db.add_all([hall, movie])
    db.flush()
    seats = [
        Seat(hall_id=hall.hall_id, row_label="A", seat_number=n, grid_row=1, grid_col=n)
        for n in (1, 2)
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
    booking_id = client.post(
        "/api/bookings",
        json={"screening_id": screening.screening_id, "seat_ids": [s.seat_id for s in seats]},
    ).json()["booking_id"]
    invoice = client.post(f"/api/bookings/{booking_id}/kaspi-invoice")
    assert invoice.status_code == 200
    return {"booking_id": booking_id, "invoice": invoice.json()}


def _expire(db: Session, booking_id: int) -> None:
    db.execute(
        update(Booking)
        .where(Booking.booking_id == booking_id)
        .values(hold_expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )


# --- POST /api/bookings/{id}/kaspi-invoice ------------------------------------------------------


def test_invoice_has_a_long_token_and_a_path(held: dict):
    invoice = held["invoice"]
    assert len(invoice["payment_token"]) >= 32
    assert invoice["pay_path"] == f"/fake-kaspi/{invoice['payment_token']}"
    assert invoice["amount"] == "4000.00"
    assert 590 <= invoice["seconds_left"] <= 600


def test_invoice_is_reused(client: TestClient, held: dict):
    again = client.post(f"/api/bookings/{held['booking_id']}/kaspi-invoice").json()
    assert again["payment_token"] == held["invoice"]["payment_token"]


def test_invoice_for_expired_hold_is_409(client: TestClient, db: Session, held: dict):
    _expire(db, held["booking_id"])
    assert client.post(f"/api/bookings/{held['booking_id']}/kaspi-invoice").status_code == 409


def test_invoice_for_someone_elses_booking_is_404(client: TestClient, db: Session, held: dict):
    _login(db, "other@test.kz")
    assert client.post(f"/api/bookings/{held['booking_id']}/kaspi-invoice").status_code == 404


def test_invoice_without_login_is_401(client: TestClient, held: dict):
    app.dependency_overrides.pop(get_current_user)
    assert client.post(f"/api/bookings/{held['booking_id']}/kaspi-invoice").status_code == 401


# --- GET /api/fake-kaspi/{token} --------------------------------------------------------------


def test_pay_page_shows_the_order_without_personal_data(client: TestClient, held: dict):
    app.dependency_overrides.pop(get_current_user)  # the phone isn't logged in

    res = client.get(f"/api/fake-kaspi/{held['invoice']['payment_token']}")

    assert res.status_code == 200
    page = res.json()
    assert (page["merchant"], page["amount"], page["status"]) == (
        "Alatau Cinema",
        "4000.00",
        "pending",
    )
    assert (page["movie_title"], page["hall"], page["seats"]) == (
        "Test movie",
        "Test hall",
        ["A1", "A2"],
    )
    assert "Secret Name" not in res.text
    assert "buyer@test.kz" not in res.text


def test_pay_page_unknown_token_is_404(client: TestClient):
    assert client.get("/api/fake-kaspi/not-a-token").status_code == 404


def test_pay_page_of_expired_hold_says_expired(client: TestClient, db: Session, held: dict):
    _expire(db, held["booking_id"])
    page = client.get(f"/api/fake-kaspi/{held['invoice']['payment_token']}").json()
    assert (page["status"], page["seconds_left"], page["seats"]) == ("expired", 0, [])


# --- POST /api/fake-kaspi/{token}/pay ---------------------------------------------------------


def _pay(client: TestClient, held: dict, decline: bool = False):
    token = held["invoice"]["payment_token"]
    return client.post(f"/api/fake-kaspi/{token}/pay", json={"decline": decline})


def test_paying_from_the_phone_marks_the_booking_paid(client: TestClient, db: Session, held):
    owner = app.dependency_overrides.pop(get_current_user)

    res = _pay(client, held)

    assert (res.status_code, res.json()["status"]) == (200, "paid")
    payment = db.scalar(select(Payment).where(Payment.booking_id == held["booking_id"]))
    assert (payment.method, payment.status, payment.amount) == ("kaspi", "success", Decimal("4000"))
    # The site polls the booking and finds it paid, with the ticket QR.
    app.dependency_overrides[get_current_user] = owner
    booking = client.get(f"/api/bookings/{held['booking_id']}").json()
    assert (booking["status"], bool(booking["qr_token"])) == ("paid", True)


def test_double_tap_pays_once(client: TestClient, db: Session, held: dict):
    _pay(client, held)
    second = _pay(client, held)

    assert (second.status_code, second.json()["status"]) == (200, "paid")
    payments = db.scalars(select(Payment).where(Payment.booking_id == held["booking_id"])).all()
    assert len(payments) == 1


def test_decline_is_402_and_can_be_retried(client: TestClient, held: dict):
    assert _pay(client, held, decline=True).status_code == 402
    assert _pay(client, held).json()["status"] == "paid"


def test_paying_an_expired_hold_is_409(client: TestClient, db: Session, held: dict):
    _expire(db, held["booking_id"])
    assert _pay(client, held).status_code == 409


def test_paying_a_cancelled_booking_is_409(client: TestClient, held: dict):
    client.post(f"/api/bookings/{held['booking_id']}/cancel")
    assert _pay(client, held).status_code == 409


def test_paying_with_unknown_token_is_404(client: TestClient):
    assert client.post("/api/fake-kaspi/not-a-token/pay", json={}).status_code == 404
