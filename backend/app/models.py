"""ORM models. Import every model here so Alembic sees it.

The tables come from docs/schema-decisions.md, added by the first schema migration (backend team).
"""

from app.db import Base

__all__ = ["Base"]
