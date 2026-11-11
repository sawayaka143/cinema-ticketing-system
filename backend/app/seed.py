"""Fill the database with demo content: halls with seats, movies with genres, a week of screenings.

Run from backend/:  python -m app.seed
Safe to run again: existing halls, movies and screenings are skipped, not duplicated.
Refuses to run when APP_ENV=production, unless --allow-production is passed
(a deliberate one-off, e.g. the demo seed before the final defence).
"""

import argparse
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.catalog import ALMATY
from app.config import get_settings
from app.db import get_engine
from app.models import Genre, Hall, Movie, Screening, Seat

CLEANING = timedelta(minutes=15)
DAYS = 7


@dataclass(frozen=True)
class HallPlan:
    name: str
    hall_type: str
    rows: int
    seats_per_row: int
    aisle_after: int  # an empty grid column after this seat number
    vip_rows: tuple[int, ...]  # 1-based row indexes
    showtimes: tuple[time, ...]
    price: Decimal


HALLS = [
    HallPlan(
        "Hall 1",
        "2D",
        8,
        12,
        6,
        (6, 7),
        (time(10), time(13), time(16), time(19), time(22)),
        Decimal("2000.00"),
    ),
    HallPlan(
        "Hall 2",
        "3D",
        7,
        10,
        5,
        (5, 6),
        (time(11), time(14), time(17), time(20), time(23)),
        Decimal("2500.00"),
    ),
    HallPlan(
        "Hall 3",
        "IMAX",
        10,
        16,
        8,
        (7, 8, 9),
        (time(12), time(15, 30), time(19), time(22, 30)),
        Decimal("3500.00"),
    ),
]

# (title, duration_min, min_age, release_year, genres, description)
MOVIES = [
    (
        "The Silent Coast",
        112,
        12,
        2025,
        ["Drama", "Mystery"],
        "A lighthouse keeper on the Caspian shore finds a message that should not exist.",
    ),
    (
        "Steppe Riders",
        128,
        12,
        2026,
        ["Adventure", "History"],
        "Three messengers race across the steppe to stop a war nobody wants.",
    ),
    (
        "Orbit Nine",
        141,
        12,
        2026,
        ["Sci-Fi", "Thriller"],
        "The crew of a cargo station realises their rescue ship is not coming.",
    ),
    (
        "Grandma's Kitchen",
        95,
        0,
        2025,
        ["Comedy", "Family"],
        "A chaotic family reunion, one recipe and a cooking contest that goes very wrong.",
    ),
    (
        "Night Shift",
        104,
        16,
        2026,
        ["Crime", "Thriller"],
        "An Almaty taxi driver picks up a passenger who knows too much.",
    ),
    (
        "Little Snow Leopard",
        88,
        0,
        2025,
        ["Animation", "Family"],
        "A young snow leopard leaves the mountains to find her lost brother.",
    ),
    (
        "Paper Hearts",
        117,
        12,
        2026,
        ["Romance", "Drama"],
        "Two translators fall in love through the books they disagree about.",
    ),
    (
        "Last Train to Turkestan",
        133,
        16,
        2025,
        ["Drama", "History"],
        "1941: a railway engineer must decide who gets the last seats on the train.",
    ),
]


OLD_POSTER_PREFIX = "https://picsum.photos/seed/"


def _poster(title: str) -> str:
    slug = "-".join(title.lower().replace("'", "").split())
    return f"/posters/{slug}.svg"


def _seat_grid(hall: Hall, plan: HallPlan) -> list[Seat]:
    seats = []
    for r in range(1, plan.rows + 1):
        label = chr(ord("A") + r - 1)
        for n in range(1, plan.seats_per_row + 1):
            col = n if n <= plan.aisle_after else n + 1  # skip one column for the aisle
            if r == 1 and n in (1, plan.seats_per_row):
                seat_type = "wheelchair"
            elif r in plan.vip_rows:
                seat_type = "vip"
            else:
                seat_type = "standard"
            seats.append(
                Seat(
                    hall_id=hall.hall_id,
                    row_label=label,
                    seat_number=n,
                    seat_type=seat_type,
                    grid_row=r,
                    grid_col=col,
                )
            )
    return seats


def seed(db: Session) -> dict[str, int]:
    added = {"halls": 0, "seats": 0, "movies": 0, "screenings": 0}

    genres = {g.name: g for g in db.scalars(select(Genre))}
    movies = {m.title: m for m in db.scalars(select(Movie))}
    for title, duration, age, year, genre_names, description in MOVIES:
        if title in movies:
            # Move the old placeholder posters to the local files; keep a poster a manager set.
            if (movies[title].poster_url or "").startswith(OLD_POSTER_PREFIX):
                movies[title].poster_url = _poster(title)
            continue
        for name in genre_names:
            genres.setdefault(name, Genre(name=name))
        movie = Movie(
            title=title,
            duration_min=duration,
            min_age=age,
            release_year=year,
            description=description,
            poster_url=_poster(title),
            genres=[genres[n] for n in genre_names],
        )
        db.add(movie)
        movies[title] = movie
        added["movies"] += 1
    db.flush()

    halls = {h.name: h for h in db.scalars(select(Hall))}
    for plan in HALLS:
        if plan.name in halls:
            continue
        hall = Hall(name=plan.name, hall_type=plan.hall_type)
        db.add(hall)
        db.flush()
        seats = _seat_grid(hall, plan)
        db.add_all(seats)
        halls[plan.name] = hall
        added["halls"] += 1
        added["seats"] += len(seats)
    db.flush()

    lineup = [movies[m[0]] for m in MOVIES]
    today = datetime.now(ALMATY).date()
    for h, plan in enumerate(HALLS):
        hall = halls[plan.name]
        booked = [
            (s, e)
            for s, e in db.execute(
                select(Screening.start_time, Screening.end_time).where(
                    Screening.hall_id == hall.hall_id
                )
            )
        ]
        for day in range(DAYS):
            for i, showtime in enumerate(plan.showtimes):
                start = datetime.combine(today + timedelta(days=day), showtime, ALMATY)
                movie = lineup[(h * 3 + day + i) % len(lineup)]
                end = start + timedelta(minutes=movie.duration_min) + CLEANING
                if any(start < b_end and b_start < end for b_start, b_end in booked):
                    continue  # already seeded, or would overlap an existing show
                db.add(
                    Screening(
                        movie_id=movie.movie_id,
                        hall_id=hall.hall_id,
                        start_time=start,
                        end_time=end,
                        base_price=plan.price,
                    )
                )
                booked.append((start, end))
                added["screenings"] += 1
    db.flush()
    return added


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.seed", description=__doc__)
    parser.add_argument(
        "--allow-production",
        action="store_true",
        help="seed even when APP_ENV=production (one-off demo seed)",
    )
    args = parser.parse_args(argv)
    if get_settings().app_env == "production":
        if not args.allow_production:
            raise SystemExit(
                "Refusing to seed: APP_ENV=production. "
                "Pass --allow-production to seed production on purpose."
            )
        print("WARNING: seeding the PRODUCTION database (--allow-production).")
    with Session(get_engine()) as db, db.begin():
        added = seed(db)
    print("Added " + ", ".join(f"{n} {k}" for k, n in added.items()))


if __name__ == "__main__":
    main()
