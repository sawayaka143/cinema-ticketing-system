"""Manager panel: halls and seat layouts."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.main import app
from app.models import (
    AuditLog,
    Booking,
    Customer,
    Movie,
    Screening,
    Seat,
    Staff,
    Ticket,
    TicketType,
)

LAYOUT = {
    "rows": 3,
    "seats_per_row": 6,
    "aisle_after": 3,
    "vip_rows": [3],
    "wheelchair_seats": ["A1", "a6"],
}


def _login(db: Session, email: str) -> CurrentUser:
    user = CurrentUser(id=uuid.uuid4(), email=email)
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
        {"id": user.id, "email": email},
    )
    return user


@pytest.fixture
def boss(db: Session) -> CurrentUser:
    user = _login(db, "boss@test.kz")
    db.add(Staff(auth_user_id=user.id, full_name="Boss", role="admin"))
    db.commit()  # a savepoint; a 409 rollback inside a request must not undo this setup
    app.dependency_overrides[get_current_user] = lambda: user
    return user


def _create(client: TestClient, name: str = "Test hall", **layout):
    return client.post(
        "/api/admin/halls", json={"name": name, "hall_type": "IMAX", **LAYOUT, **layout}
    )


def _seats(client: TestClient, hall_id: int) -> dict[str, dict]:
    seats = client.get(f"/api/admin/halls/{hall_id}/seats").json()
    return {f"{s['row_label']}{s['seat_number']}": s for s in seats}


def _screen(db: Session, hall_id: int) -> Screening:
    movie = Movie(title="Test movie", duration_min=100, min_age=0)
    db.add(movie)
    db.flush()
    start = datetime.now(UTC) + timedelta(days=3)
    screening = Screening(
        movie_id=movie.movie_id,
        hall_id=hall_id,
        start_time=start,
        end_time=start + timedelta(minutes=115),
        base_price=Decimal("2000.00"),
    )
    db.add(screening)
    db.commit()
    return screening


def _sell(db: Session, screening: Screening, seat_id: int) -> None:
    user = _login(db, "buyer@test.kz")
    customer = Customer(auth_user_id=user.id, full_name="Buyer", email="buyer@test.kz")
    ticket_type = TicketType(name="test-adult")
    db.add_all([customer, ticket_type])
    db.flush()
    booking = Booking(customer_id=customer.customer_id, status="paid")
    db.add(booking)
    db.flush()
    db.add(
        Ticket(
            booking_id=booking.booking_id,
            screening_id=screening.screening_id,
            seat_id=seat_id,
            ticket_type_id=ticket_type.ticket_type_id,
            price=Decimal("2000.00"),
        )
    )
    db.commit()


def test_create_hall_generates_the_layout(client: TestClient, db: Session, boss):
    res = _create(client)

    assert res.status_code == 201
    hall = res.json()
    assert (hall["capacity"], hall["screenings"], hall["hall_type"]) == (18, 0, "IMAX")
    seats = _seats(client, hall["hall_id"])
    assert (seats["A1"]["seat_type"], seats["A6"]["seat_type"]) == ("wheelchair", "wheelchair")
    assert seats["C2"]["seat_type"] == "vip"
    assert seats["B2"]["seat_type"] == "standard"
    assert (seats["B3"]["grid_col"], seats["B4"]["grid_col"]) == (3, 5)  # aisle in column 4
    assert db.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.table_name == "hall")
    )


def test_duplicate_hall_name_is_409(client: TestClient, boss):
    _create(client)
    assert _create(client).status_code == 409


@pytest.mark.parametrize(
    "layout",
    [{"vip_rows": [4]}, {"aisle_after": 6}, {"wheelchair_seats": ["D1"]}, {"rows": 27}],
    ids=["vip-outside", "aisle-outside", "wheelchair-outside", "too-many-rows"],
)
def test_layout_that_doesnt_fit_is_rejected(client: TestClient, boss, layout: dict):
    res = _create(client, **layout)
    assert res.status_code in (400, 422)  # 422: pydantic limits (rows <= 26)
    assert "Test hall" not in [h["name"] for h in client.get("/api/admin/halls").json()]


def test_rename_hall(client: TestClient, boss):
    hall_id = _create(client).json()["hall_id"]
    res = client.patch(f"/api/admin/halls/{hall_id}", json={"name": "Hall Ä"})
    assert (res.status_code, res.json()["name"]) == (200, "Hall Ä")


def test_rename_to_an_existing_name_is_409(client: TestClient, boss):
    _create(client)
    other = _create(client, name="Other hall").json()["hall_id"]
    assert client.patch(f"/api/admin/halls/{other}", json={"name": "Test hall"}).status_code == 409


def test_seats_of_unknown_hall_is_404(client: TestClient, boss):
    assert client.get("/api/admin/halls/999999999/seats").status_code == 404


def test_replace_layout_while_unsold(client: TestClient, db: Session, boss):
    hall_id = _create(client).json()["hall_id"]
    _screen(db, hall_id)  # a screening alone doesn't block a new layout

    res = client.put(f"/api/admin/halls/{hall_id}/layout", json={"rows": 2, "seats_per_row": 5})

    assert (res.status_code, res.json()["capacity"]) == (200, 10)


def test_replace_layout_after_a_sale_is_409(client: TestClient, db: Session, boss):
    hall_id = _create(client).json()["hall_id"]
    screening = _screen(db, hall_id)
    _sell(db, screening, _seats(client, hall_id)["B2"]["seat_id"])

    res = client.put(f"/api/admin/halls/{hall_id}/layout", json={"rows": 2, "seats_per_row": 5})

    assert res.status_code == 409
    assert len(_seats(client, hall_id)) == 18


def test_delete_hall_without_screenings(client: TestClient, db: Session, boss):
    hall_id = _create(client).json()["hall_id"]

    assert client.delete(f"/api/admin/halls/{hall_id}").status_code == 204
    assert db.scalar(select(func.count()).select_from(Seat).where(Seat.hall_id == hall_id)) == 0
    assert client.delete(f"/api/admin/halls/{hall_id}").status_code == 404


def test_delete_hall_with_screenings_is_409(client: TestClient, db: Session, boss):
    hall_id = _create(client).json()["hall_id"]
    _screen(db, hall_id)
    assert client.delete(f"/api/admin/halls/{hall_id}").status_code == 409


def test_change_seat_type(client: TestClient, boss):
    hall_id = _create(client).json()["hall_id"]
    seat_id = _seats(client, hall_id)["B2"]["seat_id"]

    res = client.patch(f"/api/admin/seats/{seat_id}", json={"seat_type": "vip"})

    assert (res.status_code, res.json()["seat_type"]) == (200, "vip")
    assert client.patch("/api/admin/seats/999999999", json={"seat_type": "vip"}).status_code == 404


def test_halls_need_a_manager(client: TestClient, db: Session):
    user = _login(db, "kassa@test.kz")
    db.add(Staff(auth_user_id=user.id, full_name="Kassa", role="cashier"))
    db.flush()
    app.dependency_overrides[get_current_user] = lambda: user
    assert _create(client).status_code == 403
    assert client.get("/api/admin/halls").status_code == 403
