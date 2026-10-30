"""Vercel installs from pyproject.toml, CI from requirements.txt. They must not drift apart."""

import tomllib
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def _requirements() -> set[str]:
    lines = (BACKEND / "requirements.txt").read_text(encoding="utf-8").splitlines()
    return {line.strip() for line in lines if line.strip() and not line.startswith("#")}


def _pyproject() -> set[str]:
    data = tomllib.loads((BACKEND / "pyproject.toml").read_text(encoding="utf-8"))
    return set(data["project"]["dependencies"])


def test_pyproject_matches_requirements() -> None:
    assert _pyproject() == _requirements()
