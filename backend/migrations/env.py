"""Alembic environment. Runs migrations against DATABASE_URL.

Use the Supabase *session* pooler (port 5432) for migrations, not the transaction pooler.
"""

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from app import models  # noqa: F401  (registers all models on Base.metadata)
from app.config import get_settings
from app.db import Base

target_metadata = Base.metadata


def _url() -> str:
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=NullPool, connect_args={"prepare_threshold": None})
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
