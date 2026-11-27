"""The logged-in user: Supabase login linked to a customer and/or staff profile."""

import re
import uuid
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import CurrentUserDep
from app.config import get_settings
from app.db import get_session
from app.models import Customer, Staff
from app.phone import InvalidPhone, normalize_phone
from app.storage import (
    EXTENSIONS as IMAGE_EXTENSIONS,
)
from app.storage import (
    StorageError,
    delete_object_by_url,
    put_object,
    read_image_body,
)

router = APIRouter(tags=["me"])

SessionDep = Annotated[Session, Depends(get_session)]

AVATAR_MAX_BYTES = 2 * 1024 * 1024
MAX_AVATAR_URL_LEN = 200_000
_AVATAR_RE = re.compile(
    r"^(preset:[a-z0-9_-]{1,30}|https://\S+|data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$"
)


class AvatarOut(BaseModel):
    url: str


class CustomerOut(BaseModel):
    customer_id: int
    full_name: str
    email: str
    phone: str | None
    city: str | None
    avatar_url: str | None


class StaffOut(BaseModel):
    staff_id: int
    full_name: str
    role: Literal["cashier", "manager", "admin"]


class Me(BaseModel):
    id: UUID
    email: str | None
    customer: CustomerOut | None
    staff: StaffOut | None = Field(description="Null when the user isn't staff or is deactivated.")


class CustomerCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(
        default=None,
        max_length=30,
        description="Spaces, dashes, brackets and a leading 8 are fine; stored as +7XXXXXXXXXX",
        examples=["8 (701) 123-45-67"],
    )
    city: str | None = Field(default=None, max_length=60)
    avatar_url: str | None = Field(default=None, max_length=MAX_AVATAR_URL_LEN)


class CustomerUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(
        default=None,
        max_length=30,
        description="Spaces, dashes, brackets and a leading 8 are fine; blank clears the phone.",
    )
    city: str | None = Field(default=None, max_length=60)
    avatar_url: str | None = Field(default=None, max_length=MAX_AVATAR_URL_LEN)


def _validate_avatar(raw: str | None) -> str | None:
    if raw is None:
        return None
    val = raw.strip()
    if not val:
        return None
    if len(val) > MAX_AVATAR_URL_LEN or not _AVATAR_RE.match(val):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Avatar must be a preset key, https:// URL, or PNG/JPEG/WebP data URL under 200 KB",
        )
    return val


def _normalize_optional_phone(raw: str | None) -> str | None:
    if not raw or not raw.strip():
        return None
    try:
        return normalize_phone(raw)
    except InvalidPhone as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


def _customer_out(c: Customer) -> CustomerOut:
    return CustomerOut(
        customer_id=c.customer_id,
        full_name=c.full_name,
        email=c.email,
        phone=c.phone,
        city=c.city,
        avatar_url=c.avatar_url,
    )


@router.get("/me", response_model=Me)
def me(user: CurrentUserDep, db: SessionDep) -> Me:
    """Who is logged in, and which profiles they have."""
    customer = db.scalar(select(Customer).where(Customer.auth_user_id == user.id))
    staff = db.scalar(select(Staff).where(Staff.auth_user_id == user.id, Staff.is_active))
    return Me(
        id=user.id,
        email=user.email,
        customer=_customer_out(customer) if customer else None,
        staff=StaffOut(staff_id=staff.staff_id, full_name=staff.full_name, role=staff.role)
        if staff
        else None,
    )


@router.post("/me/customer", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(body: CustomerCreate, user: CurrentUserDep, db: SessionDep) -> CustomerOut:
    """Create the customer profile for the logged-in user. Email comes from the login."""
    if not user.email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The login has no email address")
    name = body.full_name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Full name cannot be empty")
    phone = _normalize_optional_phone(body.phone)
    city = body.city.strip() if body.city and body.city.strip() else None
    avatar_url = _validate_avatar(body.avatar_url)
    customer = Customer(
        auth_user_id=user.id,
        full_name=name,
        email=user.email,
        phone=phone,
        city=city,
        avatar_url=avatar_url,
    )
    db.add(customer)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A customer profile already exists for this login or email"
        ) from exc
    return _customer_out(customer)


@router.patch("/me/customer", response_model=CustomerOut)
def update_customer(body: CustomerUpdate, user: CurrentUserDep, db: SessionDep) -> CustomerOut:
    """Update the logged-in customer's profile fields (name, phone, city, avatar)."""
    customer = db.scalar(select(Customer).where(Customer.auth_user_id == user.id))
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer profile not found")

    fields = body.model_fields_set
    old_avatar = customer.avatar_url
    if "full_name" in fields:
        name = (body.full_name or "").strip()
        if not name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Full name cannot be empty")
        customer.full_name = name
    if "phone" in fields:
        customer.phone = _normalize_optional_phone(body.phone)
    if "city" in fields:
        customer.city = body.city.strip() if body.city and body.city.strip() else None
    if "avatar_url" in fields:
        customer.avatar_url = _validate_avatar(body.avatar_url)
    if user.email and customer.email != user.email:
        customer.email = user.email

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That email is already linked to another customer profile"
        ) from exc
    if "avatar_url" in fields and old_avatar and old_avatar != customer.avatar_url:
        delete_object_by_url(get_settings().avatar_bucket, old_avatar)
    return _customer_out(customer)


def put_avatar_object(path: str, content: bytes, content_type: str) -> str:
    """Store a file in the avatar bucket; returns its public URL. Replaced in tests."""
    return put_object(get_settings().avatar_bucket, path, content, content_type)


@router.post(
    "/me/avatar",
    response_model=AvatarOut,
    status_code=status.HTTP_201_CREATED,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                t: {"schema": {"type": "string", "format": "binary"}} for t in IMAGE_EXTENSIONS
            },
        }
    },
)
async def upload_avatar(request: Request, user: CurrentUserDep) -> AvatarOut:
    """Upload a profile avatar (JPEG, PNG or WebP, up to 2 MB). Returns the public URL."""
    s = get_settings()
    if not (s.supabase_url and s.supabase_storage_key):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Avatar upload isn't set up (SUPABASE_STORAGE_KEY). Pick a preset icon instead.",
        )
    content, mime_type, ext = await read_image_body(request, AVATAR_MAX_BYTES, "2 MB")
    path = f"{user.id}/{uuid.uuid4().hex}.{ext}"
    try:
        url = put_avatar_object(path, content, mime_type)
    except StorageError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Storage refused the file: {exc}"
        ) from exc
    return AvatarOut(url=url)
