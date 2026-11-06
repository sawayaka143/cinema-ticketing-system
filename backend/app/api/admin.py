"""Manager panel: movies, the screening schedule and the weekly occupancy/revenue report.

Managers and admins only. Every write adds an AUDIT_LOG row (AGENTS.md backend rules).
Rules from docs/schema-decisions.md §7: end_time = start + duration + 15 min; movies with
screenings are archived, not deleted; screenings with tickets can't be deleted or moved.
"""

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy import exists, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.catalog import ALMATY, HallOut, MovieOut, _movie_out
from app.db import get_session
from app.models import Genre, Hall, Movie, Screening, Staff, Ticket
from app.staff import audit, require_staff

router = APIRouter(prefix="/admin", tags=["admin"])

SessionDep = Annotated[Session, Depends(get_session)]
ManagerDep = Annotated[Staff, Depends(require_staff("manager", "admin"))]

CLEANING = timedelta(minutes=15)
NULLABLE_MOVIE_FIELDS = {"description", "poster_url", "release_year"}


# --- movies -----------------------------------------------------------------------------------


class MovieIn(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    description: str | None = None
    poster_url: str | None = None
    duration_min: int = Field(ge=40, le=300)
    min_age: Literal[0, 6, 12, 16, 18]
    release_year: int | None = Field(default=None, ge=1900, le=2100)
    genres: list[Annotated[str, Field(min_length=1, max_length=30)]] = []


class MovieUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    poster_url: str | None = None
    duration_min: int | None = Field(default=None, ge=40, le=300)
    min_age: Literal[0, 6, 12, 16, 18] | None = None
    release_year: int | None = Field(default=None, ge=1900, le=2100)
    genres: list[Annotated[str, Field(min_length=1, max_length=30)]] | None = None
    is_active: bool | None = Field(default=None, description="false archives, true restores")


class AdminMovieOut(MovieOut):
    is_active: bool


class Removed(BaseModel):
    result: Literal["deleted", "archived"]


def _admin_movie(m: Movie) -> AdminMovieOut:
    return AdminMovieOut(**_movie_out(m).model_dump(), is_active=m.is_active)


def _genres(db: Session, names: list[str]) -> list[Genre]:
    """Genre rows for these names (case-insensitive), creating the missing ones."""
    wanted = {n.strip().lower(): n.strip() for n in names if n.strip()}
    found = {g.name.lower(): g for g in db.scalars(select(Genre))}
    genres = []
    for key, name in wanted.items():
        if key not in found:
            found[key] = Genre(name=name)
            db.add(found[key])
        genres.append(found[key])
    return genres


def _movie(db: Session, movie_id: int) -> Movie:
    movie = db.scalar(
        select(Movie).where(Movie.movie_id == movie_id).options(selectinload(Movie.genres))
    )
    if movie is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Movie not found")
    return movie


@router.get("/movies", response_model=list[AdminMovieOut])
def list_all_movies(staff: ManagerDep, db: SessionDep) -> list[AdminMovieOut]:
    """All movies, archived ones included."""
    movies = db.scalars(select(Movie).options(selectinload(Movie.genres)).order_by(Movie.title))
    return [_admin_movie(m) for m in movies]


@router.post("/movies", response_model=AdminMovieOut, status_code=status.HTTP_201_CREATED)
def create_movie(body: MovieIn, staff: ManagerDep, db: SessionDep) -> AdminMovieOut:
    movie = Movie(**body.model_dump(exclude={"genres"}))
    movie.genres = _genres(db, body.genres)
    db.add(movie)
    db.flush()
    audit(db, staff, "create", "movie", movie.movie_id, **jsonable_encoder(body))
    db.commit()
    return _admin_movie(movie)


@router.patch("/movies/{movie_id}", response_model=AdminMovieOut)
def update_movie(
    movie_id: int, body: MovieUpdate, staff: ManagerDep, db: SessionDep
) -> AdminMovieOut:
    """Change only the fields sent. `null` clears description, poster or year."""
    movie = _movie(db, movie_id)
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field == "genres":
            movie.genres = _genres(db, value or [])
        elif value is not None or field in NULLABLE_MOVIE_FIELDS:
            setattr(movie, field, value)
    if changes.get("duration_min") is not None:
        _reschedule_upcoming(db, movie)
    audit(db, staff, "update", "movie", movie_id, **jsonable_encoder(changes))
    db.commit()
    return _admin_movie(_movie(db, movie_id))


def _reschedule_upcoming(db: Session, movie: Movie) -> None:
    """A new duration moves the end of every screening that hasn't started; a clash is a 409."""
    upcoming = db.scalars(
        select(Screening).where(
            Screening.movie_id == movie.movie_id, Screening.start_time > func.now()
        )
    )
    for s in upcoming:
        s.end_time = s.start_time + timedelta(minutes=movie.duration_min) + CLEANING
    _flush_schedule(db)


@router.delete("/movies/{movie_id}", response_model=Removed)
def delete_movie(movie_id: int, staff: ManagerDep, db: SessionDep) -> Removed:
    """Deletes a movie without screenings; a movie with screenings is archived instead."""
    movie = _movie(db, movie_id)
    if db.scalar(select(exists().where(Screening.movie_id == movie_id))):
        movie.is_active = False
        result = "archived"
    else:
        db.delete(movie)
        result = "deleted"
    audit(db, staff, result, "movie", movie_id, title=movie.title)
    db.commit()
    return Removed(result=result)


# --- screenings -------------------------------------------------------------------------------


class ScreeningIn(BaseModel):
    movie_id: int
    hall_id: int
    start_time: AwareDatetime
    base_price: Decimal = Field(gt=0, max_digits=8, decimal_places=2)


class ScreeningUpdate(BaseModel):
    movie_id: int | None = None
    hall_id: int | None = None
    start_time: AwareDatetime | None = None
    base_price: Decimal | None = Field(default=None, gt=0, max_digits=8, decimal_places=2)


class AdminScreeningOut(BaseModel):
    screening_id: int
    movie_id: int
    movie_title: str
    hall: HallOut
    start_time: datetime
    end_time: datetime
    base_price: Decimal
    tickets: int = Field(description="Held or sold tickets")


def _screening_out(db: Session, s: Screening) -> AdminScreeningOut:
    tickets = db.scalar(
        select(func.count()).select_from(Ticket).where(Ticket.screening_id == s.screening_id)
    )
    return AdminScreeningOut(
        screening_id=s.screening_id,
        movie_id=s.movie_id,
        movie_title=s.movie.title,
        hall=HallOut(hall_id=s.hall.hall_id, name=s.hall.name, hall_type=s.hall.hall_type),
        start_time=s.start_time,
        end_time=s.end_time,
        base_price=s.base_price,
        tickets=tickets,
    )


def _screening(db: Session, screening_id: int) -> Screening:
    s = db.scalar(
        select(Screening)
        .where(Screening.screening_id == screening_id)
        .options(selectinload(Screening.movie), selectinload(Screening.hall))
    )
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Screening not found")
    return s


def _bookable_movie(db: Session, movie_id: int) -> Movie:
    movie = db.get(Movie, movie_id)
    if movie is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Movie not found")
    if not movie.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The movie is archived")
    return movie


def _check_hall(db: Session, hall_id: int) -> None:
    if db.get(Hall, hall_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hall not found")


def _check_future(start: datetime) -> None:
    if start <= datetime.now(UTC):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The start time is in the past")


def _has_tickets(db: Session, screening_id: int) -> bool:
    return bool(db.scalar(select(exists().where(Ticket.screening_id == screening_id))))


def _flush_schedule(db: Session) -> None:
    """Flush; a clash with another screening in the same hall becomes a 409."""
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        msg = str(exc.orig)
        if "screening_no_overlap" in msg:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "The hall is busy at that time (another screening)"
            ) from exc
        if "hall_locked_by_tickets" in msg:
            raise HTTPException(status.HTTP_409_CONFLICT, "The screening has sold tickets") from exc
        raise


@router.get("/screenings", response_model=list[AdminScreeningOut])
def list_schedule(
    staff: ManagerDep,
    db: SessionDep,
    day: Annotated[
        date | None,
        Query(alias="date", description="Day in Almaty time. Omit for the next 7 days."),
    ] = None,
) -> list[AdminScreeningOut]:
    """The schedule: screenings of one day, or the next 7 days, earliest first."""
    if day is None:
        start = datetime.now(UTC)
        end = start + timedelta(days=7)
    else:
        start = datetime.combine(day, time.min, ALMATY)
        end = start + timedelta(days=1)
    screenings = db.scalars(
        select(Screening)
        .where(Screening.start_time >= start, Screening.start_time < end)
        .options(selectinload(Screening.movie), selectinload(Screening.hall))
        .order_by(Screening.start_time, Screening.hall_id)
    )
    return [_screening_out(db, s) for s in screenings]


@router.post("/screenings", response_model=AdminScreeningOut, status_code=status.HTTP_201_CREATED)
def create_screening(body: ScreeningIn, staff: ManagerDep, db: SessionDep) -> AdminScreeningOut:
    """Put a movie into a hall. The end time includes 15 minutes of cleaning."""
    movie = _bookable_movie(db, body.movie_id)
    _check_hall(db, body.hall_id)
    _check_future(body.start_time)
    s = Screening(
        movie_id=movie.movie_id,
        hall_id=body.hall_id,
        start_time=body.start_time,
        end_time=body.start_time + timedelta(minutes=movie.duration_min) + CLEANING,
        base_price=body.base_price,
    )
    db.add(s)
    _flush_schedule(db)
    audit(db, staff, "create", "screening", s.screening_id, **jsonable_encoder(body))
    db.commit()
    return _screening_out(db, _screening(db, s.screening_id))


@router.patch("/screenings/{screening_id}", response_model=AdminScreeningOut)
def update_screening(
    screening_id: int, body: ScreeningUpdate, staff: ManagerDep, db: SessionDep
) -> AdminScreeningOut:
    """Change price any time; movie, hall and time only while no tickets exist."""
    s = _screening(db, screening_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    moves = {"movie_id", "hall_id", "start_time"} & changes.keys()
    if moves and _has_tickets(db, screening_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "The screening has sold tickets")
    movie = _bookable_movie(db, changes["movie_id"]) if "movie_id" in changes else s.movie
    if "hall_id" in changes:
        _check_hall(db, changes["hall_id"])
    if "start_time" in changes:
        _check_future(changes["start_time"])
    for field, value in changes.items():
        setattr(s, field, value)
    if moves:
        s.end_time = s.start_time + timedelta(minutes=movie.duration_min) + CLEANING
    _flush_schedule(db)
    audit(db, staff, "update", "screening", screening_id, **jsonable_encoder(changes))
    db.commit()
    return _screening_out(db, _screening(db, screening_id))


@router.delete("/screenings/{screening_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_screening(screening_id: int, staff: ManagerDep, db: SessionDep) -> None:
    s = _screening(db, screening_id)
    if _has_tickets(db, screening_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "The screening has sold tickets")
    details = {"movie_id": s.movie_id, "hall_id": s.hall_id, "start_time": s.start_time}
    db.delete(s)
    audit(db, staff, "delete", "screening", screening_id, **jsonable_encoder(details))
    try:
        db.commit()
    except IntegrityError as exc:  # a seat was held between the check and the delete
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "The screening has sold tickets") from exc


# --- report -----------------------------------------------------------------------------------


class ReportRow(BaseModel):
    screening_id: int
    title: str
    hall: str
    start_time: datetime
    capacity: int
    tickets_sold: int
    occupancy_pct: Decimal | None
    revenue: Decimal


@router.get("/report", response_model=list[ReportRow])
def occupancy_report(staff: ManagerDep, db: SessionDep) -> list[ReportRow]:
    """Next 7 days: paid tickets, occupancy and revenue per screening, emptiest first."""
    rows = db.execute(text("SELECT * FROM screening_report")).mappings()
    return [ReportRow(**row) for row in rows]
