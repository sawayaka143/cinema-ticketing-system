"""Avatar upload and Storage object cleanup tests.

The Supabase Storage HTTP call itself is replaced by a fake.
"""

import urllib.error
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import storage
from app.api import me
from app.auth import CurrentUser, get_current_user
from app.config import get_settings
from app.main import app
from app.models import Movie, Staff

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 64
WEBP = b"RIFF\x18\x00\x00\x00WEBP" + b"\0" * 16


def _login(db: Session, email: str) -> CurrentUser:
    user = CurrentUser(id=uuid.uuid4(), email=email)
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
        {"id": user.id, "email": email},
    )
    return user


@pytest.fixture
def w(db: Session, monkeypatch: pytest.MonkeyPatch) -> dict:
    user = _login(db, "avatar@test.kz")
    db.commit()
    settings = get_settings()
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_storage_key", "test-key")
    stored: list[tuple[str, bytes, str]] = []

    def fake_put(path: str, content: bytes, content_type: str) -> str:
        stored.append((path, content, content_type))
        return f"https://example.supabase.co/storage/v1/object/public/avatars/{path}"

    monkeypatch.setattr(me, "put_avatar_object", fake_put)
    app.dependency_overrides[get_current_user] = lambda: user
    return {"user": user, "stored": stored, "settings": settings}


def _upload(client: TestClient, content: bytes = WEBP, content_type: str = "image/webp"):
    return client.post("/api/me/avatar", content=content, headers={"Content-Type": content_type})


# --- unit tests (no DB needed) ---------------------------------------------------------------


def test_detect_image_type_checks_magic_bytes():
    assert storage.detect_image_type(PNG) == ("image/png", "png")
    assert storage.detect_image_type(JPEG) == ("image/jpeg", "jpg")
    assert storage.detect_image_type(WEBP) == ("image/webp", "webp")
    assert storage.detect_image_type(b"<svg></svg>") is None
    assert storage.detect_image_type(b"plain text") is None


def test_storage_put_and_delete_http_calls(monkeypatch: pytest.MonkeyPatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_storage_key", "test-key")
    calls: list[tuple[str, str, bytes | None]] = []

    def fake_urlopen(req, timeout=0):
        calls.append((req.get_method(), req.full_url, req.data))
        resp = MagicMock()
        resp.__enter__.return_value = resp
        return resp

    monkeypatch.setattr(storage.urllib.request, "urlopen", fake_urlopen)

    url = storage.put_object("avatars", "u/a.webp", WEBP, "image/webp")
    assert url == "https://example.supabase.co/storage/v1/object/public/avatars/u/a.webp"
    assert calls[0][:2] == (
        "POST",
        "https://example.supabase.co/storage/v1/object/avatars/u/a.webp",
    )

    storage.delete_object_by_url("avatars", url)
    assert calls[1][:2] == (
        "DELETE",
        "https://example.supabase.co/storage/v1/object/avatars/u/a.webp",
    )

    storage.delete_object_by_url("avatars", "preset:reel")
    storage.delete_object_by_url("posters", "/posters/orbit-nine.svg")
    assert len(calls) == 2


def test_storage_put_raises_on_http_error(monkeypatch: pytest.MonkeyPatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_storage_key", "test-key")

    def fail(req, timeout=0):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(storage.urllib.request, "urlopen", fail)
    with pytest.raises(storage.StorageError):
        storage.put_object("avatars", "u/a.png", PNG, "image/png")


# --- /api/me/avatar --------------------------------------------------------------------------


def test_upload_avatar_returns_public_url(client: TestClient, w: dict):
    r = _upload(client)
    assert r.status_code == 201
    ((path, content, content_type),) = w["stored"]
    assert path.startswith(f"{w['user'].id}/") and path.endswith(".webp")
    assert content == WEBP and content_type == "image/webp"
    assert r.json()["url"].endswith(f"/storage/v1/object/public/avatars/{path}")


def test_upload_avatar_requires_login(client: TestClient):
    assert _upload(client).status_code == 401


def test_upload_avatar_validation_and_error_codes(
    client: TestClient, w: dict, monkeypatch: pytest.MonkeyPatch
):
    assert _upload(client, b"hello", "text/plain").status_code == 415
    assert _upload(client, b"<html/>", "image/png").status_code == 415
    assert _upload(client, b"", "image/webp").status_code == 400
    big = b"\0" * (me.AVATAR_MAX_BYTES + 1)
    assert _upload(client, big, "image/jpeg").status_code == 413

    def refuse(path: str, content: bytes, content_type: str) -> str:
        raise storage.StorageError("Bucket not found")

    monkeypatch.setattr(me, "put_avatar_object", refuse)
    assert _upload(client).status_code == 502

    monkeypatch.setattr(w["settings"], "supabase_storage_key", "")
    assert _upload(client).status_code == 503


# --- cleanup on replace / delete -------------------------------------------------------------


def test_replacing_avatar_deletes_old_storage_object(
    client: TestClient, w: dict, monkeypatch: pytest.MonkeyPatch
):
    old_url = "https://example.supabase.co/storage/v1/object/public/avatars/u/old.webp"
    new_url = "https://example.supabase.co/storage/v1/object/public/avatars/u/new.webp"
    deleted: list[tuple[str, str | None]] = []
    monkeypatch.setattr(me, "delete_object_by_url", lambda b, u: deleted.append((b, u)))

    assert (
        client.post("/api/me/customer", json={"full_name": "A", "avatar_url": old_url}).status_code
        == 201
    )
    assert client.patch("/api/me/customer", json={"avatar_url": new_url}).status_code == 200
    assert deleted == [("avatars", old_url)]


def test_deleting_movie_cleans_up_poster(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
):
    from app.api import admin

    mgr = _login(db, "mgr-clean@test.kz")
    db.add(Staff(auth_user_id=mgr.id, full_name="Mgr", role="manager"))
    poster_url = "https://example.supabase.co/storage/v1/object/public/posters/old.png"
    movie = Movie(title="Tmp", duration_min=100, min_age=0, poster_url=poster_url)
    db.add(movie)
    db.commit()

    deleted: list[tuple[str, str | None]] = []
    monkeypatch.setattr(admin, "delete_object_by_url", lambda b, u: deleted.append((b, u)))
    app.dependency_overrides[get_current_user] = lambda: mgr

    res = client.delete(f"/api/admin/movies/{movie.movie_id}")
    assert res.status_code == 200
    assert res.json() == {"result": "deleted"}
    assert deleted == [("posters", poster_url)]
