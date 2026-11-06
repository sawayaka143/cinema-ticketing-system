"""Staff desk: look up a booking and refund a paid one (§6, step 4)."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.main import app
from app.models import (
    AuditLog,
    Booking,
    Customer,
    Hall,
    Movie,
    Payment,
    Screening,
    Seat,
    Staff,
    Ticket,
)


def _login(db: Session, email: str) -> CurrentUser:
    user = CurrentUser(id=uuid.uuid4(), email=email)
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
        {"id": user.id, "email": email},
    )
    return user


def _act_as(user: CurrentUser) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.fixture
def w(client: TestClient, db: Session) -> dict:
    """A customer's paid booking (A1 + A2, 4000 ₸) for a screening tomorrow, plus staff."""
    buyer = _login(db, "buyer@test.kz")
    db.add(Customer(auth_user_id=buyer.id, full_name="Buyer B.", email="buyer@test.kz"))
    cashier, retired = _login(db, "kassa@test.kz"), _login(db, "old@test.kz")
    db.add_all(
        [
            Staff(auth_user_id=cashier.id, full_name="Kassa", role="cashier"),
            Staff(auth_user_id=retired.id, full_name="Old", role="manager", is_active=False),
        ]
    )
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
    _act_as(buyer)
    booking_id = client.post(
        "/api/bookings",
        json={"screening_id": screening.screening_id, "seat_ids": [s.seat_id for s in seats]},
    ).json()["booking_id"]
    client.post(f"/api/bookings/{booking_id}/pay", json={"method": "card"})
    _act_as(cashier)
    return {
        "buyer": buyer,
        "cashier": cashier,
        "retired": retired,
        "booking_id": booking_id,
        "screening": screening,
        "seats": seats,
    }


def _refund(client: TestClient, booking_id: int):
    return client.post(f"/api/staff/bookings/{booking_id}/refund", json={"reason": "Ill"})


def test_look_up_booking(client: TestClient, w: dict):
    res = client.get(f"/api/staff/bookings/{w['booking_id']}")

    assert res.status_code == 200
    body = res.json()
    assert (body["status"], body["customer_name"], body["movie_title"]) == (
        "paid",
        "Buyer B.",
        "Test movie",
    )
    assert (len(body["tickets"]), body["total_amount"]) == (2, "4000.00")


def test_look_up_unknown_booking_is_404(client: TestClient, w: dict):
    assert client.get("/api/staff/bookings/999999999").status_code == 404


def test_refund_frees_seats_and_refunds_payment(client: TestClient, db: Session, w: dict):
    res = _refund(client, w["booking_id"])

    assert res.status_code == 200
    assert (res.json()["status"], res.json()["refunded_amount"]) == ("cancelled", "4000.00")
    payment = db.scalar(select(Payment).where(Payment.booking_id == w["booking_id"]))
    assert (payment.status, payment.refunded_at is not None) == ("refunded", True)
    assert db.get(Booking, w["booking_id"]).status == "cancelled"
    tickets = select(func.count()).select_from(Ticket)
    assert db.scalar(tickets.where(Ticket.booking_id == w["booking_id"])) == 0
    log = db.scalar(select(AuditLog).where(AuditLog.action == "refund"))
    assert (log.row_id, log.details["amount"], log.details["reason"]) == (
        w["booking_id"],
        "4000.00",
        "Ill",
    )
    # The seats can be sold again.
    _act_as(w["buyer"])
    again = client.post(
        "/api/bookings",
        json={
            "screening_id": w["screening"].screening_id,
            "seat_ids": [s.seat_id for s in w["seats"]],
        },
    )
    assert again.status_code == 201


def test_refund_twice_is_409(client: TestClient, w: dict):
    _refund(client, w["booking_id"])
    assert _refund(client, w["booking_id"]).status_code == 409


def test_refund_after_check_in_is_409(client: TestClient, db: Session, w: dict):
    staff_id = db.scalar(select(Staff.staff_id).where(Staff.full_name == "Kassa"))
    db.execute(
        update(Booking)
        .where(Booking.booking_id == w["booking_id"])
        .values(checked_in_at=datetime.now(UTC), checked_in_by_staff_id=staff_id)
    )
    res = _refund(client, w["booking_id"])
    assert (res.status_code, res.json()["detail"]) == (
        409,
        "The group has already entered the hall",
    )


def test_refund_after_start_is_409(client: TestClient, db: Session, w: dict):
    past = datetime.now(UTC) - timedelta(minutes=10)
    db.execute(
        update(Screening)
        .where(Screening.screening_id == w["screening"].screening_id)
        .values(start_time=past, end_time=past + timedelta(minutes=115))
    )
    assert _refund(client, w["booking_id"]).status_code == 409


def test_refund_unknown_booking_is_404(client: TestClient, w: dict):
    assert _refund(client, 999999999).status_code == 404


def test_refund_needs_a_reason(client: TestClient, w: dict):
    res = client.post(f"/api/staff/bookings/{w['booking_id']}/refund", json={"reason": ""})
    assert res.status_code == 422


@pytest.mark.parametrize("who", ["buyer", "retired"])
def test_refund_by_customer_or_deactivated_staff_is_403(client: TestClient, w: dict, who: str):
    _act_as(w[who])
    assert _refund(client, w["booking_id"]).status_code == 403


def test_refund_without_login_is_401(client: TestClient):
    app.dependency_overrides.pop(get_current_user, None)
    assert _refund(client, 1).status_code == 401
