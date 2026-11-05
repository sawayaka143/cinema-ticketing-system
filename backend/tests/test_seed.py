"""The demo seed fills an empty catalog once and never duplicates on a second run."""

import pytest
from sqlalchemy import create_engine, func, select
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
