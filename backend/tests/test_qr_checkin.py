"""QR ticket (one per paid booking), door check-in by staff, and the create_staff script."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.create_staff import UnknownLogin, create_staff
from app.main import app
from app.models import AuditLog, Booking, Customer, Hall, Movie, Screening, Seat, Staff


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
def people(db: Session) -> dict:
    customer = _login(db, "buyer@test.kz")
    db.add(Customer(auth_user_id=customer.id, full_name="Buyer", email="buyer@test.kz"))
    cashier = _login(db, "door@test.kz")
    db.add(Staff(auth_user_id=cashier.id, full_name="Door", role="cashier"))
    retired = _login(db, "retired@test.kz")
    db.add(Staff(auth_user_id=retired.id, full_name="Old", role="cashier", is_active=False))
    db.flush()
    return {"customer": customer, "cashier": cashier, "retired": retired}


@pytest.fixture
def paid(client: TestClient, db: Session, people: dict) -> dict:
    """A paid booking for seats A1 + A2 of a screening that starts in 10 minutes."""
    hall = Hall(name="Test hall", hall_type="2D")
    movie = Movie(title="Test movie", duration_min=100, min_age=0)
    db.add_all([hall, movie])
    db.flush()
    seats = [
        Seat(hall_id=hall.hall_id, row_label="A", seat_number=n, grid_row=1, grid_col=n)
        for n in (1, 2)
    ]
    start = datetime.now(UTC) + timedelta(minutes=10)
    screening = Screening(
        movie_id=movie.movie_id,
        hall_id=hall.hall_id,
        start_time=start,
        end_time=start + timedelta(minutes=115),
        base_price=Decimal("2000.00"),
    )
    db.add_all([*seats, screening])
    db.flush()
    _act_as(people["customer"])
    booking = client.post(
        "/api/bookings",
        json={"screening_id": screening.screening_id, "seat_ids": [s.seat_id for s in seats]},
    ).json()
    body = client.post(
        f"/api/bookings/{booking['booking_id']}/pay", json={"method": "kaspi"}
    ).json()
    return {"booking": body, "screening": screening}


def _move_screening(db: Session, screening: Screening, start: datetime) -> None:
    db.execute(
        update(Screening)
        .where(Screening.screening_id == screening.screening_id)
        .values(start_time=start, end_time=start + timedelta(minutes=115))
    )


def _checkin(client: TestClient, token: str):
    return client.post("/api/checkin", json={"token": token})


# --- the QR ticket ----------------------------------------------------------------------------


def test_paid_booking_has_one_qr_for_all_seats(client: TestClient, paid: dict):
    booking = paid["booking"]
    assert booking["status"] == "paid"
    assert len(booking["qr_token"]) >= 24
    assert len(booking["tickets"]) == 2

    res = client.get(f"/api/bookings/{booking['booking_id']}/qr.png")

    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert res.content.startswith(b"\x89PNG")


def test_pending_booking_has_no_qr(client: TestClient, db: Session, paid: dict):
    db.execute(
        update(Booking)
        .where(Booking.booking_id == paid["booking"]["booking_id"])
        .values(status="pending", hold_expires_at=datetime.now(UTC) + timedelta(minutes=5))
    )
    booking_id = paid["booking"]["booking_id"]

    assert client.get(f"/api/bookings/{booking_id}").json()["qr_token"] is None
    assert client.get(f"/api/bookings/{booking_id}/qr.png").status_code == 409


def test_someone_elses_qr_is_404(client: TestClient, people: dict, paid: dict):
    _act_as(people["cashier"])  # logged in, but not the buyer
    assert client.get(f"/api/bookings/{paid['booking']['booking_id']}/qr.png").status_code == 404


# --- POST /api/checkin ------------------------------------------------------------------------


def test_checkin_lets_the_whole_group_in_once(
    client: TestClient, db: Session, people: dict, paid: dict
):
    _act_as(people["cashier"])

    res = _checkin(client, paid["booking"]["qr_token"])

    assert res.status_code == 200
    body = res.json()
    assert (body["seats"], body["people"], body["hall"]) == (["A1", "A2"], 2, "Test hall")
    log = db.scalar(select(AuditLog).where(AuditLog.row_id == paid["booking"]["booking_id"]))
    assert (log.action, log.table_name, log.details) == ("checkin", "booking", {"people": 2})

    again = _checkin(client, paid["booking"]["qr_token"])
    assert again.status_code == 409
    assert again.json()["detail"].startswith("Already used at ")


def test_checkin_unknown_token_is_404(client: TestClient, people: dict):
    _act_as(people["cashier"])
    assert _checkin(client, "not-a-real-token").status_code == 404


def test_checkin_too_early_is_409(client: TestClient, db: Session, people: dict, paid: dict):
    _move_screening(db, paid["screening"], datetime.now(UTC) + timedelta(hours=2))
    _act_as(people["cashier"])

    res = _checkin(client, paid["booking"]["qr_token"])

    assert res.status_code == 409
    assert res.json()["detail"].startswith("Too early: entry opens at ")


def test_checkin_after_the_end_is_409(client: TestClient, db: Session, people: dict, paid: dict):
    _move_screening(db, paid["screening"], datetime.now(UTC) - timedelta(hours=3))
    _act_as(people["cashier"])

    assert _checkin(client, paid["booking"]["qr_token"]).status_code == 409


def test_checkin_cancelled_booking_is_409(
    client: TestClient, db: Session, people: dict, paid: dict
):
    db.execute(
        update(Booking)
        .where(Booking.booking_id == paid["booking"]["booking_id"])
        .values(status="cancelled")
    )
    _act_as(people["cashier"])

    assert _checkin(client, paid["booking"]["qr_token"]).status_code == 409


@pytest.mark.parametrize("who", ["customer", "retired"])
def test_checkin_by_non_staff_is_403(client: TestClient, people: dict, paid: dict, who: str):
    _act_as(people[who])
    assert _checkin(client, paid["booking"]["qr_token"]).status_code == 403


def test_checkin_without_login_is_401(client: TestClient):
    app.dependency_overrides.pop(get_current_user, None)
    assert _checkin(client, "anything").status_code == 401


# --- create_staff script ----------------------------------------------------------------------


def test_create_staff_links_a_login_and_updates_on_rerun(db: Session):
    _login(db, "Manager@Test.kz")

    staff, created = create_staff(db, "manager@test.kz", "Mia Manager", "manager")
    assert (created, staff.role, staff.is_active) == (True, "manager", True)

    again, created = create_staff(db, "manager@test.kz", "Mia M.", "admin", active=False)
    assert (created, again.staff_id, again.role, again.is_active) == (
        False,
        staff.staff_id,
        "admin",
        False,
    )


def test_create_staff_refuses_unknown_email(db: Session):
    with pytest.raises(UnknownLogin):
        create_staff(db, "nobody@test.kz", "Nobody", "cashier")
