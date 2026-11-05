"""Catalog: movies and screenings a customer can browse. No login needed."""

from datetime import UTC, date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_session
from app.models import Movie, Screening

router = APIRouter(tags=["catalog"])

# Kazakhstan uses UTC+5 all year (no daylight saving), so a fixed offset is exact.
ALMATY = timezone(timedelta(hours=5), "Asia/Almaty")

SessionDep = Annotated[Session, Depends(get_session)]


class MovieOut(BaseModel):
    movie_id: int
    title: str
    description: str | None
    poster_url: str | None
    duration_min: int
    min_age: int
    release_year: int | None
    genres: list[str]


class HallOut(BaseModel):
    hall_id: int
    name: str
    hall_type: str


class ScreeningOut(BaseModel):
    screening_id: int
    movie_id: int
    hall: HallOut
    start_time: datetime
    end_time: datetime
    base_price: Decimal


class ScreeningDetail(ScreeningOut):
    movie: MovieOut


def _movie_out(movie: Movie) -> MovieOut:
    return MovieOut(
        movie_id=movie.movie_id,
        title=movie.title,
        description=movie.description,
        poster_url=movie.poster_url,
        duration_min=movie.duration_min,
        min_age=movie.min_age,
        release_year=movie.release_year,
        genres=[g.name for g in movie.genres],
    )


def _screening_out(s: Screening) -> ScreeningOut:
    return ScreeningOut(
        screening_id=s.screening_id,
        movie_id=s.movie_id,
        hall=HallOut(hall_id=s.hall.hall_id, name=s.hall.name, hall_type=s.hall.hall_type),
        start_time=s.start_time,
        end_time=s.end_time,
        base_price=s.base_price,
    )


def _active_movie(db: Session, movie_id: int) -> Movie:
    movie = db.scalar(
        select(Movie)
        .where(Movie.movie_id == movie_id, Movie.is_active)
        .options(selectinload(Movie.genres))
    )
    if movie is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Movie not found")
    return movie


@router.get("/movies", response_model=list[MovieOut])
def list_movies(db: SessionDep) -> list[MovieOut]:
    """Active movies, by title."""
    movies = db.scalars(
        select(Movie)
        .where(Movie.is_active)
        .options(selectinload(Movie.genres))
        .order_by(Movie.title)
    )
    return [_movie_out(m) for m in movies]


@router.get("/movies/{movie_id}", response_model=MovieOut)
def get_movie(movie_id: int, db: SessionDep) -> MovieOut:
    """One active movie. Unknown or archived ids are 404."""
    return _movie_out(_active_movie(db, movie_id))


@router.get("/movies/{movie_id}/screenings", response_model=list[ScreeningOut])
def list_movie_screenings(
    movie_id: int,
    db: SessionDep,
    day: Annotated[
        date | None,
        Query(
            alias="date", description="Day in Almaty time (YYYY-MM-DD). Omit for the next 7 days."
        ),
    ] = None,
) -> list[ScreeningOut]:
    """Upcoming screenings of one movie, earliest first. Past screenings are never listed."""
    _active_movie(db, movie_id)
    now = datetime.now(UTC)
    if day is None:
        start, end = now, now + timedelta(days=7)
    else:
        start = max(now, datetime.combine(day, time.min, ALMATY))
        end = datetime.combine(day + timedelta(days=1), time.min, ALMATY)
    screenings = db.scalars(
        select(Screening)
        .where(
            Screening.movie_id == movie_id,
            Screening.start_time >= start,
            Screening.start_time < end,
        )
        .options(selectinload(Screening.hall))
        .order_by(Screening.start_time)
    )
    return [_screening_out(s) for s in screenings]


@router.get("/screenings/{screening_id}", response_model=ScreeningDetail)
def get_screening(screening_id: int, db: SessionDep) -> ScreeningDetail:
    """One screening with its movie and hall."""
    s = db.scalar(
        select(Screening)
        .where(Screening.screening_id == screening_id)
        .options(
            selectinload(Screening.hall),
            selectinload(Screening.movie).selectinload(Movie.genres),
        )
    )
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Screening not found")
    return ScreeningDetail(**_screening_out(s).model_dump(), movie=_movie_out(s.movie))
