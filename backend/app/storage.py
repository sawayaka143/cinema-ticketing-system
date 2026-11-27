"""Shared Supabase Storage helpers for posters and user avatars.

Uploads go through FastAPI using `SUPABASE_STORAGE_KEY` (the project's service_role key),
so buckets stay public-read while direct browser writes remain blocked by RLS.
"""

import contextlib
import json
import urllib.error
import urllib.request
from urllib.parse import urlparse

from fastapi import HTTPException, Request, status

from app.config import get_settings

EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class StorageError(Exception):
    pass


def detect_image_type(data: bytes) -> tuple[str, str] | None:
    """Return (mime_type, extension) from magic bytes, or None if not JPEG/PNG/WebP."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None


async def read_image_body(
    request: Request, max_bytes: int, max_label: str
) -> tuple[bytes, str, str]:
    """Validate Content-Type, body size, and magic bytes for a raw image upload."""
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in EXTENSIONS:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a JPEG, PNG or WebP image"
        )
    content = await request.body()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is empty")
    if len(content) > max_bytes:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE, f"The image is larger than {max_label}"
        )
    detected = detect_image_type(content)
    if detected is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a valid JPEG, PNG or WebP image"
        )
    mime_type, ext = detected
    return content, mime_type, ext


def put_object(bucket: str, path: str, content: bytes, content_type: str) -> str:
    """Upload bytes to `bucket/path` in Supabase Storage; returns the public URL."""
    s = get_settings()
    base = s.supabase_url.rstrip("/")
    clean_path = path.lstrip("/")
    req = urllib.request.Request(
        f"{base}/storage/v1/object/{bucket}/{clean_path}",
        data=content,
        method="POST",
        headers={
            "apikey": s.supabase_storage_key,
            "Authorization": f"Bearer {s.supabase_storage_key}",
            "Content-Type": content_type,
            "Cache-Control": "max-age=31536000",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            res.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:200]
        with contextlib.suppress(ValueError):
            detail = json.loads(detail).get("message", detail)
        raise StorageError(f"{exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise StorageError(str(exc.reason)) from exc
    return f"{base}/storage/v1/object/public/{bucket}/{clean_path}"


def delete_object_by_url(bucket: str, url: str | None) -> None:
    """Best-effort delete of an old stored image in `bucket` when replaced or removed."""
    if not url:
        return
    s = get_settings()
    base = s.supabase_url.rstrip("/")
    key = s.supabase_storage_key.strip()
    if not (base and key):
        return
    prefix = f"{base}/storage/v1/object/public/{bucket}/"
    if not url.startswith(prefix):
        return
    marker = f"/storage/v1/object/public/{bucket}/"
    path = urlparse(url).path
    idx = path.find(marker)
    if idx == -1:
        return
    object_path = path[idx + len(marker) :]
    if not object_path:
        return
    req = urllib.request.Request(
        f"{base}/storage/v1/object/{bucket}/{object_path}",
        method="DELETE",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
        },
    )
    with (
        contextlib.suppress(urllib.error.HTTPError, urllib.error.URLError),
        urllib.request.urlopen(req, timeout=10) as res,
    ):
        res.read()
