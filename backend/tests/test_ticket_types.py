"""Ticket types and discounts (#57): seed values, the price examples, and the §7 rules."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user, get_optional_user
from app.main import app
from app.models import Customer, Hall, Movie, Screening, Seat, Staff, TicketType


def _login(db: Session, email: str, *, staff: bool | None = None) -> CurrentUser:
    """A customer login; staff=True adds an active STAFF row, staff=False an inactive one."""
    user = CurrentUser(id=uuid.uuid4(), email=email)
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
        {"id": user.id, "email": email},
    )
    db.add(Customer(auth_user_id=user.id, full_name="Test", email=email))
    if staff is not None:
        db.add(Staff(auth_user_id=user.id, full_name="Test", role="cashier", is_active=staff))
    db.flush()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_optional_user] = lambda: user
    return user


def _show(db: Session, *, min_age: int = 0, base: str = "2000.00") -> dict:
    """A future screening; seats A1-A3 standard, B1-B2 vip."""
    hall = Hall(name=f"Hall {uuid.uuid4().hex[:6]}", hall_type="2D")
    movie = Movie(title="Test movie", duration_min=100, min_age=min_age)
    db.add_all([hall, movie])
    db.flush()
    layout = [("A", 1, "standard"), ("A", 2, "standard"), ("A", 3, "standard")]
    layout += [("B", 1, "vip"), ("B", 2, "vip")]
    seats = {
        f"{row}{n}": Seat(
            hall_id=hall.hall_id,
            row_label=row,
            seat_number=n,
            seat_type=kind,
            grid_row=ord(row) - 64,
            grid_col=n,
        )
        for row, n, kind in layout
    }
    start = datetime.now(UTC) + timedelta(days=1)
    screening = Screening(
        movie_id=movie.movie_id,
        hall_id=hall.hall_id,
        start_time=start,
        end_time=start + timedelta(minutes=115),
        base_price=Decimal(base),
    )
    db.add_all([*seats.values(), screening])
    db.flush()
    return {"screening": screening, "seats": seats}


def _hold(client: TestClient, show: dict, choice: dict[str, str | None]):
    """choice: seat label -> ticket type name, or None for the default (adult)."""
    seats = show["seats"]
    return client.post(
        "/api/bookings",
        json={
            "screening_id": show["screening"].screening_id,
            "seat_ids": [seats[label].seat_id for label in choice],
            "ticket_types": {
                str(seats[label].seat_id): name for label, name in choice.items() if name
            },
        },
    )


def test_seed_values(db: Session):
    rows = {
        t.name: (t.discount_pct, t.max_age, t.staff_only)
        for t in db.scalars(
            select(TicketType).where(TicketType.name.in_(["adult", "student", "child", "staff"]))
        )
    }
    assert rows == {
        "adult": (Decimal("0.00"), None, False),
        "student": (Decimal("20.00"), None, False),
        "child": (Decimal("30.00"), 11, False),
        "staff": (Decimal("50.00"), None, True),
    }


# --- the four worked examples from #57 --------------------------------------------------------


def test_example_vip_student(client: TestClient, db: Session):
    _login(db, "s@test.kz")
    body = _hold(client, _show(db, base="2500.00"), {"B1": "student"}).json()
    assert body["tickets"][0]["price"] == "3000.00"
    assert body["tickets"][0]["ticket_type"] == "student"


def test_example_standard_child(client: TestClient, db: Session):
    _login(db, "c@test.kz")
    body = _hold(client, _show(db), {"A1": "child"}).json()
    assert body["tickets"][0]["price"] == "1400.00"


def test_example_vip_staff(client: TestClient, db: Session):
    _login(db, "st@test.kz", staff=True)
    body = _hold(client, _show(db), {"B1": "staff"}).json()
    assert body["tickets"][0]["price"] == "1500.00"


def test_example_adult_plus_child_total(client: TestClient, db: Session):
    _login(db, "f@test.kz")
    body = _hold(client, _show(db), {"A1": None, "A2": "child"}).json()
    assert [t["ticket_type"] for t in body["tickets"]] == ["adult", "child"]
    assert body["total_amount"] == "3400.00"


# --- failures -----------------------------------------------------------------------------------


@pytest.mark.parametrize("min_age", [12, 16, 18])
def test_child_ticket_for_12_plus_is_400(client: TestClient, db: Session, min_age: int):
    _login(db, "c@test.kz")
    res = _hold(client, _show(db, min_age=min_age), {"A1": "child"})
    assert res.status_code == 400
    assert res.json()["detail"] == f"child tickets are not allowed for {min_age}+"


def test_child_ticket_for_6_plus_is_fine(client: TestClient, db: Session):
    _login(db, "c@test.kz")
    assert _hold(client, _show(db, min_age=6), {"A1": "child"}).status_code == 201


@pytest.mark.parametrize("staff", [None, False], ids=["not-staff", "deactivated"])
def test_staff_ticket_without_active_staff_is_403(client: TestClient, db: Session, staff):
    _login(db, "x@test.kz", staff=staff)
    assert _hold(client, _show(db), {"A1": "staff"}).status_code == 403


def test_third_staff_ticket_is_400(client: TestClient, db: Session):
    _login(db, "st@test.kz", staff=True)
    res = _hold(client, _show(db), {"A1": "staff", "A2": "staff", "A3": "staff"})
    assert res.status_code == 400
    assert "At most 2" in res.json()["detail"]


def test_unknown_type_is_400(client: TestClient, db: Session):
    _login(db, "u@test.kz")
    assert _hold(client, _show(db), {"A1": "pensioner"}).status_code == 400


def test_type_for_a_seat_not_in_the_hold_is_400(client: TestClient, db: Session):
    _login(db, "u@test.kz")
    show = _show(db)
    res = client.post(
        "/api/bookings",
        json={
            "screening_id": show["screening"].screening_id,
            "seat_ids": [show["seats"]["A1"].seat_id],
            "ticket_types": {str(show["seats"]["A2"].seat_id): "child"},
        },
    )
    assert res.status_code == 400


# --- GET /api/ticket-types ----------------------------------------------------------------------


def _type_names(client: TestClient, screening_id: int | None = None) -> list[str]:
    params = {"screening_id": screening_id} if screening_id else {}
    return [t["name"] for t in client.get("/api/ticket-types", params=params).json()]


def test_ticket_types_for_anonymous_hide_staff(client: TestClient):
    names = _type_names(client)
    assert {"adult", "student", "child"} <= set(names)
    assert "staff" not in names


def test_ticket_types_for_staff_and_16_plus(client: TestClient, db: Session):
    _login(db, "st@test.kz", staff=True)
    show = _show(db, min_age=16)
    names = _type_names(client, show["screening"].screening_id)
    assert "staff" in names
    assert "child" not in names


def test_ticket_types_unknown_screening_is_404(client: TestClient):
    assert client.get("/api/ticket-types", params={"screening_id": 999999999}).status_code == 404
