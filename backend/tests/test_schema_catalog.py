"""Rules from the first migration (users and catalog tables)."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Hall, Movie, Screening

START = datetime(2030, 1, 1, 18, 0, tzinfo=UTC)


def _hall_and_movie(db: Session) -> tuple[Hall, Movie]:
    hall = Hall(name="Test hall", hall_type="2D")
    movie = Movie(title="Test movie", duration_min=100, min_age=12)
    db.add_all([hall, movie])
    db.flush()
    return hall, movie


def _screening(hall: Hall, movie: Movie, start: datetime) -> Screening:
    return Screening(
        hall_id=hall.hall_id,
        movie_id=movie.movie_id,
        start_time=start,
        end_time=start + timedelta(minutes=115),
        base_price=Decimal("2500.00"),
    )


def test_back_to_back_screenings_in_one_hall_are_allowed(db: Session):
    hall, movie = _hall_and_movie(db)
    db.add(_screening(hall, movie, START))
    db.add(_screening(hall, movie, START + timedelta(minutes=115)))
    db.flush()


def test_overlapping_screenings_in_one_hall_are_rejected(db: Session):
    hall, movie = _hall_and_movie(db)
    db.add(_screening(hall, movie, START))
    db.flush()
    db.add(_screening(hall, movie, START + timedelta(minutes=60)))
    with pytest.raises(IntegrityError, match="screening_no_overlap"):
        db.flush()


def test_unknown_age_rating_is_rejected(db: Session):
    db.add(Movie(title="Bad rating", duration_min=100, min_age=13))
    with pytest.raises(IntegrityError):
        db.flush()
