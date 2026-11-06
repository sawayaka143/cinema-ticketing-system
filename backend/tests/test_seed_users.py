"""Test logins get the right customer / staff profile, and a second run adds nothing."""

from uuid import UUID, uuid4

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import Customer, Staff
from app.seed_users import TEST_USERS, TestUser, link_profiles


def _logins(db: Session, users: list[TestUser]) -> list[tuple[TestUser, UUID]]:
    """Fresh auth.users rows with unique emails, so a real seed in the dev DB can't collide."""
    out = []
    for u in users:
        auth_id, email = uuid4(), f"{uuid4().hex[:8]}-{u.email}"
        db.execute(
            text("INSERT INTO auth.users (id, email) VALUES (:id, :email)"),
            {"id": auth_id, "email": email},
        )
        out.append((TestUser(email, u.full_name, u.role), auth_id))
    return out


def test_link_profiles_creates_one_profile_per_role_once(db: Session):
    users = _logins(db, TEST_USERS)
    first = link_profiles(db, users)
    assert len(first) == len(TEST_USERS)

    customer_id = users[0][1]
    assert db.scalar(select(Customer).where(Customer.auth_user_id == customer_id)) is not None
    roles = {
        s.role
        for s in db.scalars(select(Staff).where(Staff.auth_user_id.in_([a for _, a in users[1:]])))
    }
    assert roles == {"cashier", "manager", "admin"}

    assert link_profiles(db, users) == []


def test_link_profiles_reactivates_a_deactivated_staff_login(db: Session):
    manager = next(u for u in TEST_USERS if u.role == "manager")
    ((manager, auth_id),) = _logins(db, [manager])
    db.add(Staff(auth_user_id=auth_id, full_name="Old", role="cashier", is_active=False))
    db.flush()

    assert link_profiles(db, [(manager, auth_id)]) == []
    staff = db.scalar(select(Staff).where(Staff.auth_user_id == auth_id))
    assert (staff.role, staff.is_active) == ("manager", True)
