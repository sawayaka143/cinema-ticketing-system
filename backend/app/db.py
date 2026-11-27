import os
from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool, QueuePool

from app.config import get_settings


class Base(DeclarativeBase):
    """Base class for all ORM models. Alembic reads its metadata."""


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    # Serverless (Vercel) + Supabase transaction pooler:
    # no client-side pool on Vercel; locally pool connections to avoid TLS per request.
    connect_args = {"prepare_threshold": None}
    if os.getenv("VERCEL"):
        return create_engine(url, poolclass=NullPool, connect_args=connect_args)
    return create_engine(
        url,
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, closed afterwards."""
    session = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
