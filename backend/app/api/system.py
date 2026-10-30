from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth import CurrentUserDep

router = APIRouter(tags=["system"])


class Health(BaseModel):
    status: str


class Me(BaseModel):
    id: UUID
    email: str | None


@router.get("/health", response_model=Health)
def health() -> Health:
    """Liveness check used after every deploy."""
    return Health(status="ok")


@router.get("/me", response_model=Me)
def me(user: CurrentUserDep) -> Me:
    """The logged-in Supabase user. Proves auth works end to end."""
    return Me(id=user.id, email=user.email)
