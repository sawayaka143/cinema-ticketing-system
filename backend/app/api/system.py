from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["system"])


class Health(BaseModel):
    status: str


@router.get("/health", response_model=Health)
def health() -> Health:
    """Liveness check used after every deploy."""
    return Health(status="ok")
