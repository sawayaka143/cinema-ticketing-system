from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import get_settings


class Base(DeclarativeBase):
    """Base class for all ORM models. Alembic reads its metadata."""


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    # Serverless (Vercel) + Supabase transaction pooler:
    # no client-side pool, and no prepared statements (the pooler doesn't support them).
    return create_engine(url, poolclass=NullPool, connect_args={"prepare_threshold": None})


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, closed afterwards."""
    session = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
