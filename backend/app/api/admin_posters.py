"""Admin: upload a movie poster image to Supabase Storage and get its public URL.

The browser sends the image itself as the request body (Content-Type image/jpeg, image/png or
image/webp), so no multipart dependency is needed. The backend stores it in the public bucket
`POSTER_BUCKET` with `SUPABASE_STORAGE_KEY` (a server-side key; the frontend never talks to
Supabase Storage directly) and returns the URL to save as the movie's `poster_url`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.models import Staff
from app.staff import audit, require_staff
from app.storage import EXTENSIONS, StorageError, read_image_body
from app.storage import put_object as storage_put_object

router = APIRouter(prefix="/admin", tags=["admin"])

SessionDep = Annotated[Session, Depends(get_session)]
ManagerDep = Annotated[Staff, Depends(require_staff("manager", "admin"))]

MAX_BYTES = 4 * 1024 * 1024  # Vercel functions take request bodies up to about 4.5 MB


class PosterOut(BaseModel):
    url: str


def put_object(path: str, content: bytes, content_type: str) -> str:
    """Store a file in the poster bucket; returns its public URL. Replaced in tests."""
    return storage_put_object(get_settings().poster_bucket, path, content, content_type)


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
    content, mime_type, ext = await read_image_body(request, MAX_BYTES, "4 MB")

    path = f"{uuid.uuid4().hex}.{ext}"
    try:
        url = put_object(path, content, mime_type)
    except StorageError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Storage refused the file: {exc}"
        ) from exc
    audit(db, staff, "upload", "poster", None, url=url, bytes=len(content))
    db.commit()
    return PosterOut(url=url)
