"""Admin: poster upload to Supabase Storage. The storage call itself is replaced by a fake."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api import admin_posters
from app.auth import CurrentUser, get_current_user
from app.config import get_settings
from app.main import app
from app.models import AuditLog, Staff

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 64


def _login(db: Session, email: str) -> CurrentUser:
    user = CurrentUser(id=uuid.uuid4(), email=email)
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
        {"id": user.id, "email": email},
    )
    return user


@pytest.fixture
def w(db: Session, monkeypatch: pytest.MonkeyPatch) -> dict:
    """A manager and a cashier; storage configured, with a fake that records what it got."""
    manager, cashier = _login(db, "boss@test.kz"), _login(db, "kassa@test.kz")
    db.add_all(
        [
            Staff(auth_user_id=manager.id, full_name="Boss", role="manager"),
            Staff(auth_user_id=cashier.id, full_name="Kassa", role="cashier"),
        ]
    )
    db.commit()
    settings = get_settings()
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_storage_key", "test-key")
    stored: list[tuple[str, bytes, str]] = []

    def fake_put(path: str, content: bytes, content_type: str) -> str:
        stored.append((path, content, content_type))
        return f"https://example.supabase.co/storage/v1/object/public/posters/{path}"

    monkeypatch.setattr(admin_posters, "put_object", fake_put)
    app.dependency_overrides[get_current_user] = lambda: manager
    return {"cashier": cashier, "stored": stored, "settings": settings}


def _upload(client: TestClient, content: bytes = PNG, content_type: str = "image/png"):
    return client.post(
        "/api/admin/posters", content=content, headers={"Content-Type": content_type}
    )


def test_upload_returns_public_url_and_is_audited(client: TestClient, db: Session, w: dict):
    audits = select(func.count()).select_from(AuditLog).where(AuditLog.table_name == "poster")
    before = db.scalar(audits)

    r = _upload(client)

    assert r.status_code == 201
    ((path, content, content_type),) = w["stored"]
    assert path.endswith(".png") and content == PNG and content_type == "image/png"
    assert r.json()["url"].endswith(f"/storage/v1/object/public/posters/{path}")
    assert db.scalar(audits) == before + 1


def test_upload_not_an_image_is_415(client: TestClient, w: dict):
    assert _upload(client, b"hello", "text/plain").status_code == 415
    assert w["stored"] == []


def test_upload_too_big_is_413(client: TestClient, w: dict):
    big = b"\0" * (admin_posters.MAX_BYTES + 1)
    assert _upload(client, big, "image/jpeg").status_code == 413


def test_upload_empty_is_400(client: TestClient, w: dict):
    assert _upload(client, b"", "image/webp").status_code == 400


def test_upload_without_storage_key_is_503(
    client: TestClient, w: dict, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(w["settings"], "supabase_storage_key", "")
    assert _upload(client).status_code == 503


def test_storage_refusal_is_502(client: TestClient, w: dict, monkeypatch: pytest.MonkeyPatch):
    def refuse(path: str, content: bytes, content_type: str) -> str:
        raise admin_posters.StorageError("404 Bucket not found")

    monkeypatch.setattr(admin_posters, "put_object", refuse)
    r = _upload(client)
    assert r.status_code == 502
    assert "Bucket not found" in r.json()["detail"]


def test_upload_by_cashier_is_403(client: TestClient, w: dict):
    app.dependency_overrides[get_current_user] = lambda: w["cashier"]
    assert _upload(client).status_code == 403
