"""Shared test fixtures.

Database tests need DATABASE_URL pointing at a migrated Postgres (CI provides one).
Without it they are skipped, so `pytest` still runs on a laptop with no database.
Each test runs inside a transaction that is rolled back, so tests never leave data behind.
"""

from collections.abc import Iterator

import pytest
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_engine


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
