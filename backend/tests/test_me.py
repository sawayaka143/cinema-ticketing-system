"""/api/me and /api/me/customer: token verification is mocked, the database is real."""

import uuid
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.main import app
from app.models import Staff


@pytest.fixture
def login(db: Session) -> Callable[..., CurrentUser]:
    """Create a Supabase login (auth.users row) and act as that user."""

    def _login(email: str | None = "user@test.kz") -> CurrentUser:
        user = CurrentUser(id=uuid.uuid4(), email=email)
        db.execute(
            text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
            {"id": user.id, "email": email},
        )
        app.dependency_overrides[get_current_user] = lambda: user
        return user

    return _login


def test_me_without_profiles(client: TestClient, login):
    user = login()
    res = client.get("/api/me")
    assert res.status_code == 200
    assert res.json() == {"id": str(user.id), "email": user.email, "customer": None, "staff": None}


def test_me_shows_active_staff_role_only(client: TestClient, login, db: Session):
    user = login()
    staff = Staff(auth_user_id=user.id, full_name="Manager", role="manager")
    db.add(staff)
    db.flush()
    assert client.get("/api/me").json()["staff"]["role"] == "manager"

    staff.is_active = False
    db.flush()
    assert client.get("/api/me").json()["staff"] is None


def test_create_customer_profile(client: TestClient, login):
    login("new@test.kz")
    res = client.post("/api/me/customer", json={"full_name": " Aruzhan ", "phone": "+77011234567"})
    assert res.status_code == 201
    assert res.json()["full_name"] == "Aruzhan"
    assert res.json()["email"] == "new@test.kz"
    assert client.get("/api/me").json()["customer"]["phone"] == "+77011234567"


def test_second_customer_profile_is_409(client: TestClient, login):
    login()
    assert client.post("/api/me/customer", json={"full_name": "A"}).status_code == 201
    assert client.post("/api/me/customer", json={"full_name": "A"}).status_code == 409


def test_bad_phone_is_rejected(client: TestClient, login):
    login()
    res = client.post("/api/me/customer", json={"full_name": "A", "phone": "8 701 123"})
    assert res.status_code == 400
    assert "+7" in res.json()["detail"]


def test_phone_is_normalized_on_create(client: TestClient, login):
    login()
    res = client.post("/api/me/customer", json={"full_name": "A", "phone": "8 (701) 123-45-67"})
    assert (res.status_code, res.json()["phone"]) == (201, "+77011234567")


def test_blank_phone_is_stored_as_null(client: TestClient, login):
    login()
    res = client.post("/api/me/customer", json={"full_name": "A", "phone": "  "})
    assert (res.status_code, res.json()["phone"]) == (201, None)


def test_create_customer_without_token_is_401(client: TestClient):
    assert client.post("/api/me/customer", json={"full_name": "A"}).status_code == 401
