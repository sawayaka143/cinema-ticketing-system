"""Admin: upload a movie poster image to Supabase Storage and get its public URL.

The browser sends the image itself as the request body (Content-Type image/jpeg, image/png or
image/webp), so no multipart dependency is needed. The backend stores it in the public bucket
`POSTER_BUCKET` with `SUPABASE_STORAGE_KEY` (a server-side key; the frontend never talks to
Supabase Storage directly) and returns the URL to save as the movie's `poster_url`.
"""

import contextlib
import json
import urllib.error
import urllib.request
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.models import Staff
from app.staff import audit, require_staff

router = APIRouter(prefix="/admin", tags=["admin"])

SessionDep = Annotated[Session, Depends(get_session)]
ManagerDep = Annotated[Staff, Depends(require_staff("manager", "admin"))]

MAX_BYTES = 4 * 1024 * 1024  # Vercel functions take request bodies up to about 4.5 MB
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class PosterOut(BaseModel):
    url: str


class StorageError(Exception):
    pass


def put_object(path: str, content: bytes, content_type: str) -> str:
    """Store a file in the poster bucket; returns its public URL. Replaced in tests."""
    s = get_settings()
    base = s.supabase_url.rstrip("/")
    req = urllib.request.Request(
        f"{base}/storage/v1/object/{s.poster_bucket}/{path}",
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
    return f"{base}/storage/v1/object/public/{s.poster_bucket}/{path}"


@router.post(
    "/posters",
    response_model=PosterOut,
    status_code=status.HTTP_201_CREATED,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {t: {"schema": {"type": "string", "format": "binary"}} for t in EXTENSIONS},
        }
    },
)
async def upload_poster(request: Request, staff: ManagerDep, db: SessionDep) -> PosterOut:
    """Upload a poster (JPEG, PNG or WebP, up to 4 MB). Returns the public URL to save."""
    s = get_settings()
    if not (s.supabase_url and s.supabase_storage_key):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Poster upload isn't set up (SUPABASE_STORAGE_KEY). Paste a poster link instead.",
        )
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in EXTENSIONS:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a JPEG, PNG or WebP image"
        )
    content = await request.body()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is empty")
    if len(content) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "The image is larger than 4 MB")

    path = f"{uuid.uuid4().hex}.{EXTENSIONS[content_type]}"
    try:
        url = put_object(path, content, content_type)
    except StorageError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Storage refused the file: {exc}"
        ) from exc
    audit(db, staff, "upload", "poster", None, url=url, bytes=len(content))
    db.commit()
    return PosterOut(url=url)
