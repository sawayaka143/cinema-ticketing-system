"""Make an existing Supabase login a staff member (until there is an admin screen for it).

Run from backend/:
    python -m app.create_staff --email kassa@cinema.kz --name "Aigerim S." --role cashier

The person signs up first (Supabase Auth). Running it again for the same login updates the name
and role and re-activates the account; --deactivate turns staff access off.
"""

import argparse
from collections.abc import Sequence
from typing import get_args

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db import get_engine
from app.models import Staff
from app.staff import Role


class UnknownLogin(Exception):
    pass


def create_staff(
    db: Session, email: str, full_name: str, role: Role, *, active: bool = True
) -> tuple[Staff, bool]:
    """Create or update the STAFF row for the login with this email. Returns (staff, created)."""
    auth_user_id = db.scalar(
        text("SELECT id FROM auth.users WHERE lower(email) = lower(:email)"), {"email": email}
    )
    if auth_user_id is None:
        raise UnknownLogin(f"No login with email {email}. Sign up in the app first.")
    staff = db.scalar(select(Staff).where(Staff.auth_user_id == auth_user_id))
    created = staff is None
    if created:
        staff = Staff(auth_user_id=auth_user_id, full_name=full_name, role=role, is_active=active)
        db.add(staff)
    else:
        staff.full_name, staff.role, staff.is_active = full_name, role, active
    db.flush()
    return staff, created


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--role", required=True, choices=get_args(Role))
    parser.add_argument("--deactivate", action="store_true", help="turn staff access off")
    args = parser.parse_args(argv)

    with Session(get_engine()) as db:
        try:
            staff, created = create_staff(
                db, args.email, args.name, args.role, active=not args.deactivate
            )
        except UnknownLogin as exc:
            raise SystemExit(str(exc)) from exc
        db.commit()
        state = "active" if staff.is_active else "deactivated"
        verb = "Created" if created else "Updated"
        print(f"{verb} staff #{staff.staff_id}: {staff.full_name}, {staff.role}, {state}")


if __name__ == "__main__":
    main()
