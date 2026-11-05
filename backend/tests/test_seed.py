"""The demo seed fills an empty catalog once and never duplicates on a second run."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import seed as seed_module
from app.models import Screening, Seat


def test_seed_twice_adds_nothing_the_second_time(db: Session):
    first = seed_module.seed(db)
    assert first["screenings"] > 0
    seats = db.scalar(select(func.count()).select_from(Seat))
    screenings = db.scalar(select(func.count()).select_from(Screening))

    second = seed_module.seed(db)

    assert second == {"halls": 0, "seats": 0, "movies": 0, "screenings": 0}
    assert db.scalar(select(func.count()).select_from(Seat)) == seats
    assert db.scalar(select(func.count()).select_from(Screening)) == screenings


def test_seed_refuses_production(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        seed_module, "get_settings", lambda: type("S", (), {"app_env": "production"})
    )
    with pytest.raises(SystemExit, match="production"):
        seed_module.main()
