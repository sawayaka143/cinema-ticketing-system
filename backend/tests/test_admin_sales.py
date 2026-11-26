"""Admin dashboard: sales per period (total, per day, per movie) and the Excel export."""

import io
import uuid
import zipfile
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.catalog import ALMATY
from app.auth import CurrentUser, get_current_user
from app.main import app
from app.models import (
    Booking,
    Customer,
    Hall,
    Movie,
    Payment,
    Screening,
    Seat,
    Staff,
    Ticket,
    TicketType,
)

DAY1 = datetime(2026, 10, 5, tzinfo=ALMATY)


def _login(db: Session, email: str) -> CurrentUser:
    user = CurrentUser(id=uuid.uuid4(), email=email)
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
        {"id": user.id, "email": email},
    )
    return user


@pytest.fixture
def w(db: Session) -> dict:
    """A manager, a cashier, a customer, a 4-seat hall, two movies with one screening each."""
    manager, cashier, buyer = (
        _login(db, "boss@test.kz"),
        _login(db, "kassa@test.kz"),
        _login(db, "buyer@test.kz"),
    )
    customer = Customer(auth_user_id=buyer.id, full_name="Buyer", email=buyer.email)
    hall = Hall(name="Sales hall", hall_type="2D")
    alpha = Movie(title="Alpha", duration_min=100, min_age=0)
    beta = Movie(title="Beta", duration_min=100, min_age=0)
    adult = TicketType(name=f"t-{uuid.uuid4().hex[:8]}")
    db.add_all(
        [
            Staff(auth_user_id=manager.id, full_name="Boss", role="manager"),
            Staff(auth_user_id=cashier.id, full_name="Kassa", role="cashier"),
            customer,
            hall,
            alpha,
            beta,
            adult,
        ]
    )
    db.flush()
    seats = [
        Seat(hall_id=hall.hall_id, row_label="A", seat_number=n, grid_row=1, grid_col=n)
        for n in range(1, 5)
    ]
    start = DAY1 + timedelta(days=3, hours=18)
    screenings = [
        Screening(
            movie_id=m.movie_id,
            hall_id=hall.hall_id,
            start_time=start + timedelta(hours=3 * i),
            end_time=start + timedelta(hours=3 * i, minutes=115),
            base_price=Decimal("2000"),
        )
        for i, m in enumerate([alpha, beta])
    ]
    db.add_all([*seats, *screenings])
    db.commit()
    app.dependency_overrides[get_current_user] = lambda: manager
    return {
        "cashier": cashier,
        "customer": customer,
        "seats": seats,
        "screenings": screenings,
        "type": adult,
        "alpha": alpha,
        "beta": beta,
    }


def _sale(db: Session, w: dict, screening: int, seats: list[int], paid_at: datetime, status="paid"):
    """A booking with tickets at 1000 each and a successful payment at `paid_at`."""
    booking = Booking(customer_id=w["customer"].customer_id, status=status)
    db.add(booking)
    db.flush()
    for n in seats:
        db.add(
            Ticket(
                booking_id=booking.booking_id,
                screening_id=w["screenings"][screening].screening_id,
                seat_id=w["seats"][n].seat_id,
                ticket_type_id=w["type"].ticket_type_id,
                price=Decimal("1000.00"),
            )
        )
    db.add(
        Payment(
            booking_id=booking.booking_id,
            amount=Decimal(1000 * len(seats)),
            method="card",
            status="refunded" if status == "cancelled" else "success",
            paid_at=paid_at.astimezone(UTC),
        )
    )
    db.commit()


def _period(first: datetime, last: datetime) -> dict:
    return {"from": first.date().isoformat(), "to": last.date().isoformat()}


def test_sales_totals_per_day_and_per_movie(client: TestClient, db: Session, w: dict):
    _sale(db, w, 0, [0, 1], DAY1 + timedelta(hours=10))  # Alpha, day 1, 2 tickets
    # 00:30 in Almaty is still the previous day in UTC: it must count on day 2.
    _sale(db, w, 1, [0], DAY1 + timedelta(days=1, minutes=30))  # Beta, day 2
    _sale(db, w, 0, [2], DAY1 + timedelta(days=1, hours=9))  # Alpha, day 2
    _sale(db, w, 1, [1], DAY1 + timedelta(hours=12), status="cancelled")  # refunded: not counted
    _sale(db, w, 0, [3], DAY1 + timedelta(days=5))  # outside the period

    r = client.get("/api/admin/sales", params=_period(DAY1, DAY1 + timedelta(days=2)))

    assert r.status_code == 200
    body = r.json()
    assert body["total"] == {"bookings": 3, "tickets": 4, "revenue": "4000.00"}
    assert [(d["day"], d["tickets"], d["revenue"]) for d in body["by_day"]] == [
        ("2026-10-05", 2, "2000.00"),
        ("2026-10-06", 2, "2000.00"),
        ("2026-10-07", 0, "0"),
    ]
    assert [(m["title"], m["bookings"], m["tickets"]) for m in body["by_movie"]] == [
        ("Alpha", 2, 3),
        ("Beta", 1, 1),
    ]


@pytest.mark.parametrize(
    "params",
    [
        {"from": "2026-10-07", "to": "2026-10-05"},  # backwards
        {"from": "2025-01-01", "to": "2026-10-05"},  # longer than a year
    ],
)
def test_sales_bad_period_is_400(client: TestClient, w: dict, params: dict):
    assert client.get("/api/admin/sales", params=params).status_code == 400


def test_sales_for_cashier_is_403(client: TestClient, w: dict):
    app.dependency_overrides[get_current_user] = lambda: w["cashier"]
    assert client.get("/api/admin/sales").status_code == 403


def test_export_is_an_excel_file_with_a_total(client: TestClient, db: Session, w: dict):
    _sale(db, w, 0, [0, 1], DAY1 + timedelta(hours=10))

    r = client.get("/api/admin/sales/export", params=_period(DAY1, DAY1 + timedelta(days=1)))

    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert 'filename="sales_2026-10-05_2026-10-06.xlsx"' in r.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(r.content)) as xlsx:
        assert "xl/workbook.xml" in xlsx.namelist()
        sheet = xlsx.read("xl/worksheets/sheet1.xml").decode()
    assert "Total" in sheet and "<v>2000.00</v>" in sheet
    assert "Alpha" not in sheet  # the export is not split by movie


def test_export_bad_period_is_400(client: TestClient, w: dict):
    r = client.get("/api/admin/sales/export", params={"from": "2026-10-07", "to": "2026-10-01"})
    assert r.status_code == 400
