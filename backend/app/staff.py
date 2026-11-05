"""Staff access: a Supabase login linked to an active STAFF row with an allowed role."""

from collections.abc import Callable
from typing import Annotated, Literal

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUserDep
from app.db import get_session
from app.models import AuditLog, Staff

Role = Literal["cashier", "manager", "admin"]
ALL_ROLES: tuple[Role, ...] = ("cashier", "manager", "admin")


def require_staff(*roles: Role) -> Callable[..., Staff]:
    """FastAPI dependency: the active staff member, if their role is one of `roles`; else 403."""
    allowed = roles or ALL_ROLES

    def _dependency(user: CurrentUserDep, db: Annotated[Session, Depends(get_session)]) -> Staff:
        staff = db.scalar(select(Staff).where(Staff.auth_user_id == user.id, Staff.is_active))
        if staff is None or staff.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff only")
        return staff

    return _dependency


def audit(
    db: Session, staff: Staff, action: str, table: str, row_id: int | None, **details
) -> None:
    """Add the AUDIT_LOG row every staff write needs (committed with the caller's change)."""
    db.add(
        AuditLog(
            staff_id=staff.staff_id,
            action=action,
            table_name=table,
            row_id=row_id,
            details=details or None,
        )
    )
