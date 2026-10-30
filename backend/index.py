"""Vercel entrypoint: Vercel looks for an `app` object in index.py."""

from app.main import app

__all__ = ["app"]
