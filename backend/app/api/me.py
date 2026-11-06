"""The logged-in user: Supabase login linked to a customer and/or staff profile."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import CurrentUserDep
from app.db import get_session
from app.models import Customer, Staff
from app.phone import InvalidPhone, normalize_phone

router = APIRouter(tags=["me"])

SessionDep = Annotated[Session, Depends(get_session)]


class CustomerOut(BaseModel):
    customer_id: int
    full_name: str
    email: str
    phone: str | None


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


def _customer_out(c: Customer) -> CustomerOut:
    return CustomerOut(
        customer_id=c.customer_id, full_name=c.full_name, email=c.email, phone=c.phone
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
    phone = None
    if body.phone and body.phone.strip():
        try:
            phone = normalize_phone(body.phone)
        except InvalidPhone as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    customer = Customer(
        auth_user_id=user.id, full_name=body.full_name.strip(), email=user.email, phone=phone
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
