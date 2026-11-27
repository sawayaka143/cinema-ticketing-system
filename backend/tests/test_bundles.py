"""Family and group deals (docs/schema-decisions.md §7): when they apply and what they cost."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Hall, Movie, Screening, Seat
from app.pricing import bundle_for, price_before_bundle, ticket_price
from tests.test_ticket_types import _login


def _show(db: Session, *, min_age: int = 0, base: str = "2000.00") -> dict:
    """A future screening; seats A1-A8 standard, B1-B2 vip."""
    hall = Hall(name=f"Hall {uuid.uuid4().hex[:6]}", hall_type="2D")
    movie = Movie(title="Family movie", duration_min=100, min_age=min_age)
    db.add_all([hall, movie])
    db.flush()
    layout = [("A", n, "standard") for n in range(1, 9)] + [("B", 1, "vip"), ("B", 2, "vip")]
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


# --- the rule itself ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("names", "expected"),
    [
        (["adult", "adult", "child"], "family"),
        (["adult", "adult", "child", "child", "child", "child"], "family"),  # family wins a tie
        (["adult", "child", "child"], None),  # one adult only
        (["adult", "adult"], None),  # no children
        (["adult", "adult"] + ["child"] * 5, "group"),  # 5 children: not family, but 7 seats
        (["adult"] * 5, None),
        (["adult"] * 6, "group"),
        (["student"] * 6, "group"),
        (["staff", "staff"] + ["adult"] * 4, "group"),  # staff count towards the group size
    ],
)
def test_bundle_rule(names: list[str], expected: str | None):
    assert bundle_for(names) == expected


def test_price_before_bundle_round_trips():
    sold = ticket_price(Decimal("2500.00"), "standard", Decimal(30), Decimal(10))
    assert sold == Decimal("1575.00")
    assert price_before_bundle(sold, Decimal(10)) == Decimal("1750.00")


# --- through the API ----------------------------------------------------------------------------


def test_family_deal_takes_ten_percent(client: TestClient, db: Session):
    _login(db, "family@test.kz")
    res = _hold(
        client, _show(db, base="2500.00"), {"A1": None, "A2": None, "A3": "child", "A4": "child"}
    )
    assert res.status_code == 201
    body = res.json()
    # 2 × 2500 + 2 × 1750 = 8500 before the deal, 7650 after it.
    assert body["bundle"] == "family"
    assert body["total_amount"] == "7650.00"
    assert body["bundle_saving"] == "850.00"
    assert sorted(t["price"] for t in body["tickets"]) == [
        "1575.00",
        "1575.00",
        "2250.00",
        "2250.00",
    ]


def test_group_deal_stacks_on_student(client: TestClient, db: Session):
    _login(db, "group@test.kz")
    choice = {f"A{n}": "student" for n in range(1, 9)}
    body = _hold(client, _show(db), choice).json()
    # 8 × 1600 = 12800 before the deal, 11520 after it.
    assert body["bundle"] == "group"
    assert body["total_amount"] == "11520.00"
    assert body["bundle_saving"] == "1280.00"


def test_staff_tickets_keep_their_own_price(client: TestClient, db: Session):
    _login(db, "staffgroup@test.kz", staff=True)
    choice = {"B1": "staff", "B2": "staff"} | {f"A{n}": None for n in range(1, 5)}
    body = _hold(client, _show(db), choice).json()
    assert body["bundle"] == "group"
    prices = {t["ticket_type"]: t["price"] for t in body["tickets"]}
    assert prices == {"staff": "1500.00", "adult": "1800.00"}  # staff not discounted again
    assert body["bundle_saving"] == "800.00"  # 4 adults × 200


def test_booking_keeps_its_deal_when_read_again(client: TestClient, db: Session):
    _login(db, "again@test.kz")
    held = _hold(client, _show(db), {"A1": None, "A2": None, "A3": "child"}).json()
    again = client.get(f"/api/bookings/{held['booking_id']}").json()
    assert (again["bundle"], again["bundle_saving"]) == ("family", held["bundle_saving"])


# --- no deal ------------------------------------------------------------------------------------


def test_one_adult_with_children_gets_no_family_deal(client: TestClient, db: Session):
    _login(db, "single@test.kz")
    body = _hold(client, _show(db), {"A1": None, "A2": "child", "A3": "child"}).json()
    assert body["bundle"] is None
    assert body["bundle_saving"] == "0.00"
    assert body["total_amount"] == "4800.00"  # 2000 + 1400 + 1400, no deal


def test_five_seats_get_no_group_deal(client: TestClient, db: Session):
    _login(db, "five@test.kz")
    body = _hold(client, _show(db), {f"A{n}": None for n in range(1, 6)}).json()
    assert body["bundle"] is None
    assert body["total_amount"] == "10000.00"


def test_no_family_deal_for_12_plus(client: TestClient, db: Session):
    _login(db, "teen@test.kz")
    res = _hold(client, _show(db, min_age=12), {"A1": None, "A2": None, "A3": "child"})
    assert res.status_code == 400  # child tickets are refused, so no family deal either
