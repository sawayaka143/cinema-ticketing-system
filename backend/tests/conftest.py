"""Shared test fixtures.

Database tests need DATABASE_URL pointing at a migrated Postgres (CI provides one).
Without it they are skipped, so `pytest` still runs on a laptop with no database.
Each test runs inside a transaction that is rolled back, so tests never leave data behind.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_engine, get_session
from app.main import app


@pytest.fixture
def db() -> Iterator[Session]:
    if not get_settings().database_url:
        pytest.skip("DATABASE_URL is not set")
    connection = get_engine().connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    """A test client whose requests use the rolled-back `db` session."""
    app.dependency_overrides[get_session] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
