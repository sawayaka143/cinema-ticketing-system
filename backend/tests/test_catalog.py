"""Catalog endpoints: one success and one failure case each."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.catalog import ALMATY
from app.models import Genre, Hall, Movie, Screening


@pytest.fixture
def catalog(db: Session) -> dict:
    drama = Genre(name="test-drama")
    movie = Movie(title="Test movie", duration_min=100, min_age=12, genres=[drama])
    archived = Movie(title="Old movie", duration_min=90, min_age=0, is_active=False)
    hall = Hall(name="Test hall", hall_type="IMAX")
    db.add_all([movie, archived, hall])
    db.flush()
    tomorrow = (datetime.now(ALMATY) + timedelta(days=1)).replace(
        hour=19, minute=0, second=0, microsecond=0
    )
    shows = {
        "past": datetime.now(UTC) - timedelta(days=1),
        "tomorrow": tomorrow,
        "in_10_days": tomorrow + timedelta(days=9),
    }
    screenings = {}
    for key, start in shows.items():
        s = Screening(
            movie_id=movie.movie_id,
            hall_id=hall.hall_id,
            start_time=start,
            end_time=start + timedelta(minutes=115),
            base_price=Decimal("2500.00"),
        )
        db.add(s)
        screenings[key] = s
    db.flush()
    return {"movie": movie, "archived": archived, "screenings": screenings, "day": tomorrow.date()}


def test_list_movies_shows_active_movies_with_genres(client: TestClient, catalog: dict):
    res = client.get("/api/movies")
    assert res.status_code == 200
    titles = {m["title"]: m for m in res.json()}
    assert titles["Test movie"]["genres"] == ["test-drama"]
    assert "Old movie" not in titles


def test_get_movie(client: TestClient, catalog: dict):
    res = client.get(f"/api/movies/{catalog['movie'].movie_id}")
    assert res.status_code == 200
    assert res.json()["min_age"] == 12


def test_archived_movie_is_404(client: TestClient, catalog: dict):
    assert client.get(f"/api/movies/{catalog['archived'].movie_id}").status_code == 404


def test_unknown_movie_is_404(client: TestClient, catalog: dict):
    assert client.get("/api/movies/999999999").status_code == 404


def test_screenings_default_to_next_7_days(client: TestClient, catalog: dict):
    res = client.get(f"/api/movies/{catalog['movie'].movie_id}/screenings")
    assert res.status_code == 200
    ids = [s["screening_id"] for s in res.json()]
    assert ids == [catalog["screenings"]["tomorrow"].screening_id]
    assert res.json()[0]["hall"]["hall_type"] == "IMAX"


def test_screenings_for_one_day(client: TestClient, catalog: dict):
    res = client.get(
        f"/api/movies/{catalog['movie'].movie_id}/screenings", params={"date": str(catalog["day"])}
    )
    assert [s["screening_id"] for s in res.json()] == [
        catalog["screenings"]["tomorrow"].screening_id
    ]


def test_screenings_with_a_bad_date_are_422(client: TestClient, catalog: dict):
    res = client.get(f"/api/movies/{catalog['movie'].movie_id}/screenings", params={"date": "soon"})
    assert res.status_code == 422


def test_screenings_of_unknown_movie_are_404(client: TestClient, catalog: dict):
    assert client.get("/api/movies/999999999/screenings").status_code == 404


def test_get_screening_includes_movie_and_hall(client: TestClient, catalog: dict):
    s = catalog["screenings"]["tomorrow"]
    res = client.get(f"/api/screenings/{s.screening_id}")
    assert res.status_code == 200
    body = res.json()
    assert body["movie"]["title"] == "Test movie"
    assert body["hall"]["name"] == "Test hall"
    assert body["base_price"] == "2500.00"


def test_unknown_screening_is_404(client: TestClient, catalog: dict):
    assert client.get("/api/screenings/999999999").status_code == 404


def _ids(res) -> list[int]:
    return [s["screening_id"] for s in res.json()]


def test_all_screenings_default_to_next_7_days(client: TestClient, catalog: dict):
    res = client.get("/api/screenings")
    assert res.status_code == 200
    shows = catalog["screenings"]
    assert shows["tomorrow"].screening_id in _ids(res)
    assert shows["past"].screening_id not in _ids(res)
    assert shows["in_10_days"].screening_id not in _ids(res)
    item = next(s for s in res.json() if s["screening_id"] == shows["tomorrow"].screening_id)
    assert item["movie"]["title"] == "Test movie"
    assert item["movie"]["genres"] == ["test-drama"]
    assert item["hall"]["hall_type"] == "IMAX"


def test_all_screenings_for_one_day(client: TestClient, catalog: dict):
    res = client.get("/api/screenings", params={"date": str(catalog["day"])})
    assert res.status_code == 200
    assert catalog["screenings"]["tomorrow"].screening_id in _ids(res)
    for s in res.json():
        assert datetime.fromisoformat(s["start_time"]).astimezone(ALMATY).date() == catalog["day"]


def test_all_screenings_skip_archived_movies(client: TestClient, catalog: dict, db: Session):
    hidden = Screening(
        movie_id=catalog["archived"].movie_id,
        hall_id=catalog["screenings"]["tomorrow"].hall_id,
        start_time=catalog["screenings"]["tomorrow"].start_time + timedelta(hours=3),
        end_time=catalog["screenings"]["tomorrow"].start_time + timedelta(hours=5),
        base_price=Decimal("2000.00"),
    )
    db.add(hidden)
    db.flush()
    assert hidden.screening_id not in _ids(client.get("/api/screenings"))


def test_all_screenings_for_a_past_day_are_empty(client: TestClient, catalog: dict):
    yesterday = datetime.now(ALMATY).date() - timedelta(days=1)
    res = client.get("/api/screenings", params={"date": str(yesterday)})
    assert res.status_code == 200
    assert res.json() == []


def test_all_screenings_with_a_bad_date_are_422(client: TestClient, catalog: dict):
    assert client.get("/api/screenings", params={"date": "soon"}).status_code == 422
