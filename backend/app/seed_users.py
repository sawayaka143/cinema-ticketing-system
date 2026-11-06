"""Create test logins for every role on the DEV Supabase project: customer, cashier, manager, admin.

Run from backend/:  python -m app.seed_users
Needs two values in backend/.env (never commit them):
  SUPABASE_SERVICE_ROLE_KEY  Supabase dashboard -> Project Settings -> API keys -> service_role
  SEED_USER_PASSWORD         one shared password for all test logins (at least 6 characters)

The logins are created already confirmed through the Supabase Admin API, so no confirmation
email is sent (the built-in mailer allows only a few per hour). Safe to run again: an existing
login gets its password reset to SEED_USER_PASSWORD, and existing profiles are kept.
Refuses to run when APP_ENV=production.
"""

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_engine
from app.models import Customer, Staff


@dataclass(frozen=True)
class TestUser:
    email: str
    full_name: str
    role: str  # "customer" or a staff role: cashier, manager, admin


TEST_USERS = [
    TestUser("customer@alatau.test", "Test Customer", "customer"),
    TestUser("cashier@alatau.test", "Test Cashier", "cashier"),
    TestUser("manager@alatau.test", "Test Manager", "manager"),
    TestUser("admin@alatau.test", "Test Admin", "admin"),
]


class AuthAdmin:
    """The few Supabase Auth Admin API calls this script needs (stdlib only, no extra deps)."""

    def __init__(self, supabase_url: str, service_key: str) -> None:
        self.base = supabase_url.rstrip("/") + "/auth/v1/admin/users"
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }

    def _call(self, method: str, url: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers=self.headers)
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read() or b"{}")

    def find(self, email: str) -> UUID | None:
        page = 1
        while True:
            users = self._call("GET", f"{self.base}?page={page}&per_page=200").get("users", [])
            for u in users:
                if (u.get("email") or "").lower() == email:
                    return UUID(u["id"])
            if len(users) < 200:
                return None
            page += 1

    def ensure(self, user: TestUser, password: str) -> UUID:
        """Create the login confirmed, or reset its password if it already exists."""
        existing = self.find(user.email)
        if existing is not None:
            self._call("PUT", f"{self.base}/{existing}", {"password": password})
            return existing
        created = self._call(
            "POST",
            self.base,
            {
                "email": user.email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": user.full_name},
            },
        )
        return UUID(created["id"])


def link_profiles(db: Session, users: list[tuple[TestUser, UUID]]) -> list[str]:
    """Give each login its customer or staff row. Returns what was added."""
    added = []
    for user, auth_id in users:
        if user.role == "customer":
            if db.scalar(select(Customer).where(Customer.auth_user_id == auth_id)) is None:
                db.add(Customer(auth_user_id=auth_id, full_name=user.full_name, email=user.email))
                added.append(f"customer {user.email}")
        else:
            staff = db.scalar(select(Staff).where(Staff.auth_user_id == auth_id))
            if staff is None:
                db.add(Staff(auth_user_id=auth_id, full_name=user.full_name, role=user.role))
                added.append(f"{user.role} {user.email}")
            else:
                staff.role, staff.is_active = user.role, True
    db.flush()
    return added


def main() -> None:
    settings = get_settings()
    if settings.app_env == "production":
        raise SystemExit("Refusing to create test logins: APP_ENV=production.")
    missing = [
        name
        for name, value in [
            ("SUPABASE_URL", settings.supabase_url),
            ("SUPABASE_SERVICE_ROLE_KEY", settings.supabase_service_role_key),
            ("SEED_USER_PASSWORD", settings.seed_user_password),
        ]
        if not value
    ]
    if missing:
        raise SystemExit(f"Set {', '.join(missing)} in backend/.env first (see the docstring).")
    if len(settings.seed_user_password) < 6:
        raise SystemExit("SEED_USER_PASSWORD must have at least 6 characters.")

    admin = AuthAdmin(settings.supabase_url, settings.supabase_service_role_key)
    try:
        users = [(u, admin.ensure(u, settings.seed_user_password)) for u in TEST_USERS]
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:300]
        raise SystemExit(f"Supabase Admin API said {exc.code}: {detail}") from exc

    with Session(get_engine()) as db, db.begin():
        added = link_profiles(db, users)
    print("Added " + (", ".join(added) if added else "nothing (all profiles exist)"))
    print("Logins (password = SEED_USER_PASSWORD):")
    for u in TEST_USERS:
        print(f"  {u.role:<9} {u.email}")


if __name__ == "__main__":
    main()
