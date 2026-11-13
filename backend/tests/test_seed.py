"""The demo seed fills an empty catalog once and never duplicates on a second run."""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app import seed as seed_module
from app.models import Booking, Customer, Hall, Movie, Screening, Seat, Ticket, TicketType


def test_seed_twice_adds_nothing_the_second_time(db: Session):
    first = seed_module.seed(db)
    assert first["screenings"] > 0
    seats = db.scalar(select(func.count()).select_from(Seat))
    screenings = db.scalar(select(func.count()).select_from(Screening))

    second = seed_module.seed(db)

    assert second == {"halls": 0, "seats": 0, "movies": 0, "screenings": 0}
    assert db.scalar(select(func.count()).select_from(Seat)) == seats
    assert db.scalar(select(func.count()).select_from(Screening)) == screenings


def test_seed_moves_old_placeholder_posters_to_local_files(db: Session):
    seed_module.seed(db)
    movie = db.scalar(select(Movie).where(Movie.title == "Grandma's Kitchen"))
    movie.poster_url = "https://picsum.photos/seed/grandma's-kitchen/400/600"

    seed_module.seed(db)

    assert movie.poster_url == "/posters/grandmas-kitchen.svg"


def test_seed_keeps_a_poster_set_by_a_manager(db: Session):
    seed_module.seed(db)
    movie = db.scalar(select(Movie).where(Movie.title == "Orbit Nine"))
    movie.poster_url = "https://example.com/orbit.jpg"

    seed_module.seed(db)

    assert movie.poster_url == "https://example.com/orbit.jpg"


def _fake_env(monkeypatch: pytest.MonkeyPatch, app_env: str) -> list[Session]:
    """Pretend APP_ENV is `app_env` and record seed() calls instead of touching a database."""
    calls: list[Session] = []
    monkeypatch.setattr(seed_module, "get_settings", lambda: type("S", (), {"app_env": app_env}))
    monkeypatch.setattr(seed_module, "get_engine", lambda: create_engine("sqlite://"))
    monkeypatch.setattr(seed_module, "seed", lambda db: calls.append(db) or {"halls": 0})
    return calls


def test_seed_refuses_production_without_flag(monkeypatch: pytest.MonkeyPatch):
    calls = _fake_env(monkeypatch, "production")
    with pytest.raises(SystemExit, match="--allow-production"):
        seed_module.main([])
    assert calls == []


def test_seed_runs_in_production_with_flag(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    calls = _fake_env(monkeypatch, "production")
    seed_module.main(["--allow-production"])
    assert len(calls) == 1
    assert "PRODUCTION" in capsys.readouterr().out


@pytest.mark.parametrize("argv", [[], ["--allow-production"]])
def test_seed_runs_outside_production_with_or_without_flag(
    monkeypatch: pytest.MonkeyPatch, argv: list[str]
):
    calls = _fake_env(monkeypatch, "development")
    seed_module.main(argv)
    assert len(calls) == 1


def _hall_seats(db: Session, name: str) -> list[Seat]:
    hall = db.scalar(select(Hall).where(Hall.name == name))
    return list(db.scalars(select(Seat).where(Seat.hall_id == hall.hall_id)))


def test_imax_plan_is_three_eight_three_in_nine_rows():
    plan = next(p for p in seed_module.HALLS if p.name == "Hall 3")
    assert (plan.hall_type, plan.rows, plan.seats_per_row, plan.aisles_after) == (
        "IMAX",
        9,
        14,
        (3, 11),
    )


def test_relayout_rebuilds_an_unsold_hall(db: Session):
    seed_module.seed(db)

    assert seed_module.relayout(db, "Hall 3") == 9 * 14

    seats = _hall_seats(db, "Hall 3")
    assert len(seats) == 126
    assert {s.row_label for s in seats} == set("ABCDEFGHI")
    by_number = {s.seat_number: s.grid_col for s in seats if s.row_label == "E"}
    assert [by_number[n] for n in (3, 4, 11, 12)] == [3, 5, 12, 14]  # two aisles


def test_relayout_refuses_a_hall_with_tickets(db: Session):
    seed_module.seed(db)
    seat = _hall_seats(db, "Hall 3")[0]
    screening = db.scalar(select(Screening).where(Screening.hall_id == seat.hall_id))
    user_id = uuid.uuid4()
    db.execute(text("INSERT INTO auth.users (id, email) VALUES (:i, 'r@test.kz')"), {"i": user_id})
    customer = Customer(auth_user_id=user_id, full_name="R", email="r@test.kz")
    ticket_type = TicketType(name="test-relayout")
    db.add_all([customer, ticket_type])
    db.flush()
    booking = Booking(customer_id=customer.customer_id)
    db.add(booking)
    db.flush()
    db.add(
        Ticket(
            booking_id=booking.booking_id,
            screening_id=screening.screening_id,
            seat_id=seat.seat_id,
            ticket_type_id=ticket_type.ticket_type_id,
            price=Decimal("3500.00"),
        )
    )
    db.flush()

    with pytest.raises(seed_module.RelayoutRefused, match="already has tickets"):
        seed_module.relayout(db, "Hall 3")


def test_relayout_refuses_an_unknown_hall(db: Session):
    with pytest.raises(seed_module.RelayoutRefused, match="No hall"):
        seed_module.relayout(db, "Hall 99")
