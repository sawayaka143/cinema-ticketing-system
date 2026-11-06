"""Manager panel: movies, screenings, report. Staff role checks and audit rows."""

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
    Hall,
    Movie,
    Screening,
    Seat,
    Staff,
    Ticket,
    TicketType,
)

START = (datetime.now(UTC) + timedelta(days=2)).replace(hour=12, minute=0, second=0, microsecond=0)


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
def w(db: Session) -> dict:
    """A manager, a cashier, a hall with one seat, and a 100-minute movie."""
    manager, cashier = _login(db, "boss@test.kz"), _login(db, "kassa@test.kz")
    db.add_all(
        [
            Staff(auth_user_id=manager.id, full_name="Boss", role="manager"),
            Staff(auth_user_id=cashier.id, full_name="Kassa", role="cashier"),
        ]
    )
    hall = Hall(name="Test hall", hall_type="2D")
    movie = Movie(title="Test movie", duration_min=100, min_age=0)
    db.add_all([hall, movie])
    db.flush()
    seat = Seat(hall_id=hall.hall_id, row_label="A", seat_number=1, grid_row=1, grid_col=1)
    db.add(seat)
    db.commit()  # a savepoint; a 409 rollback inside a request must not undo this setup
    _act_as(manager)
    return {"manager": manager, "cashier": cashier, "hall": hall, "movie": movie, "seat": seat}


def _new_screening(client: TestClient, w: dict, start: datetime = START, **extra):
    body = {
        "movie_id": w["movie"].movie_id,
        "hall_id": w["hall"].hall_id,
        "start_time": start.isoformat(),
        "base_price": "2000.00",
        **extra,
    }
    return client.post("/api/admin/screenings", json=body)


def _sell_ticket(db: Session, w: dict, screening_id: int) -> None:
    user = _login(db, f"{uuid.uuid4().hex[:8]}@test.kz")
    customer = Customer(auth_user_id=user.id, full_name="Buyer", email=user.email)
    ticket_type = TicketType(name=f"t-{uuid.uuid4().hex[:8]}")
    db.add_all([customer, ticket_type])
    db.flush()
    booking = Booking(customer_id=customer.customer_id, status="paid")
    db.add(booking)
    db.flush()
    db.add(
        Ticket(
            booking_id=booking.booking_id,
            screening_id=screening_id,
            seat_id=w["seat"].seat_id,
            ticket_type_id=ticket_type.ticket_type_id,
            price=Decimal("2000.00"),
        )
    )
    db.commit()


def _audits(db: Session, table: str) -> int:
    return db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.table_name == table))


# --- access -----------------------------------------------------------------------------------


def test_cashier_is_403(client: TestClient, w: dict):
    _act_as(w["cashier"])
    assert client.get("/api/admin/movies").status_code == 403


def test_cashier_cant_list_screenings(client: TestClient, w: dict):
    _act_as(w["cashier"])
    assert client.get("/api/admin/screenings").status_code == 403


def test_without_login_is_401(client: TestClient):
    assert client.get("/api/admin/report").status_code == 401


# --- movies -----------------------------------------------------------------------------------


def test_create_movie_with_new_and_existing_genres(client: TestClient, db: Session, w: dict):
    res = client.post(
        "/api/admin/movies",
        json={"title": "Steppe", "duration_min": 120, "min_age": 12, "genres": ["Drama", "Epic"]},
    )
    assert res.status_code == 201
    assert res.json()["genres"] == ["Drama", "Epic"]
    again = client.post(
        "/api/admin/movies",
        json={"title": "Steppe 2", "duration_min": 95, "min_age": 12, "genres": ["drama"]},
    )
    assert again.json()["genres"] == ["Drama"]  # matched case-insensitively, not duplicated
    assert _audits(db, "movie") == 2


def test_create_movie_with_bad_age_is_422(client: TestClient, w: dict):
    res = client.post("/api/admin/movies", json={"title": "X", "duration_min": 90, "min_age": 7})
    assert res.status_code == 422


def test_update_movie_and_archive_it(client: TestClient, w: dict):
    movie_id = w["movie"].movie_id

    res = client.patch(
        f"/api/admin/movies/{movie_id}", json={"title": "Renamed", "is_active": False}
    )

    assert (res.json()["title"], res.json()["is_active"]) == ("Renamed", False)
    assert client.get(f"/api/movies/{movie_id}").status_code == 404  # hidden from customers


def test_update_unknown_movie_is_404(client: TestClient, w: dict):
    assert client.patch("/api/admin/movies/999999999", json={"title": "X"}).status_code == 404


def test_delete_movie_without_screenings_deletes(client: TestClient, w: dict):
    res = client.delete(f"/api/admin/movies/{w['movie'].movie_id}")
    assert res.json() == {"result": "deleted"}


def test_delete_unknown_movie_is_404(client: TestClient, w: dict):
    assert client.delete("/api/admin/movies/999999999").status_code == 404


def test_longer_movie_moves_upcoming_screening_ends(client: TestClient, w: dict):
    sid = _new_screening(client, w).json()["screening_id"]

    res = client.patch(f"/api/admin/movies/{w['movie'].movie_id}", json={"duration_min": 130})

    assert res.status_code == 200
    screening = next(
        s for s in client.get("/api/admin/screenings").json() if s["screening_id"] == sid
    )
    assert datetime.fromisoformat(screening["end_time"]) == START + timedelta(minutes=145)


def test_longer_movie_that_clashes_is_409(client: TestClient, w: dict):
    _new_screening(client, w)
    _new_screening(client, w, START + timedelta(minutes=120))

    res = client.patch(f"/api/admin/movies/{w['movie'].movie_id}", json={"duration_min": 110})

    assert res.status_code == 409
    assert client.get(f"/api/movies/{w['movie'].movie_id}").json()["duration_min"] == 100


def test_delete_movie_with_screenings_archives(client: TestClient, w: dict):
    _new_screening(client, w)
    res = client.delete(f"/api/admin/movies/{w['movie'].movie_id}")
    assert res.json() == {"result": "archived"}


# --- screenings -------------------------------------------------------------------------------


def test_create_screening_adds_cleaning_time(client: TestClient, db: Session, w: dict):
    res = _new_screening(client, w)

    assert res.status_code == 201
    body = res.json()
    end = datetime.fromisoformat(body["end_time"])
    assert end - START == timedelta(minutes=100 + 15)
    assert body["tickets"] == 0
    assert _audits(db, "screening") == 1
    listed = client.get("/api/admin/screenings").json()
    assert body["screening_id"] in [s["screening_id"] for s in listed]


def test_overlapping_screening_is_409(client: TestClient, w: dict):
    _new_screening(client, w)
    res = _new_screening(client, w, START + timedelta(minutes=60))
    assert res.status_code == 409
    assert "busy" in res.json()["detail"]


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ({"movie_id": 999999999}, 404),
        ({"hall_id": 999999999}, 404),
        ({"start": START - timedelta(days=5)}, 400),
    ],
    ids=["unknown-movie", "unknown-hall", "past"],
)
def test_create_screening_bad_input(client: TestClient, w: dict, change: dict, code: int):
    start = change.pop("start", START)
    assert _new_screening(client, w, start, **change).status_code == code


def test_create_screening_for_archived_movie_is_400(client: TestClient, w: dict):
    client.patch(f"/api/admin/movies/{w['movie'].movie_id}", json={"is_active": False})
    assert _new_screening(client, w).status_code == 400


def test_move_screening_recomputes_end(client: TestClient, w: dict):
    sid = _new_screening(client, w).json()["screening_id"]
    later = START + timedelta(hours=5)

    res = client.patch(f"/api/admin/screenings/{sid}", json={"start_time": later.isoformat()})

    assert res.status_code == 200
    assert datetime.fromisoformat(res.json()["end_time"]) == later + timedelta(minutes=115)


def test_screening_with_tickets_cant_move_or_be_deleted(client: TestClient, db: Session, w: dict):
    sid = _new_screening(client, w).json()["screening_id"]
    _sell_ticket(db, w, sid)
    later = (START + timedelta(hours=5)).isoformat()

    assert (
        client.patch(f"/api/admin/screenings/{sid}", json={"start_time": later}).status_code == 409
    )
    assert client.delete(f"/api/admin/screenings/{sid}").status_code == 409
    price = client.patch(f"/api/admin/screenings/{sid}", json={"base_price": "2500.00"})
    assert (price.status_code, price.json()["base_price"]) == (200, "2500.00")


def test_delete_screening_without_tickets(client: TestClient, db: Session, w: dict):
    sid = _new_screening(client, w).json()["screening_id"]

    assert client.delete(f"/api/admin/screenings/{sid}").status_code == 204
    assert db.get(Screening, sid) is None
    assert client.delete(f"/api/admin/screenings/{sid}").status_code == 404


# --- report -----------------------------------------------------------------------------------


def test_report_counts_paid_tickets(client: TestClient, db: Session, w: dict):
    sid = _new_screening(client, w).json()["screening_id"]
    _sell_ticket(db, w, sid)

    rows = {r["screening_id"]: r for r in client.get("/api/admin/report").json()}

    assert rows[sid]["tickets_sold"] == 1
    assert rows[sid]["capacity"] == 1
    assert rows[sid]["revenue"] == "2000.00"
    assert Decimal(rows[sid]["occupancy_pct"]) == Decimal("100.0")
