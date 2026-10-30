"""Write the API contract to backend/openapi.json.

Run from backend/:  python -m app.export_openapi
The frontend generates its TypeScript types from this file; CI fails if it's stale.
"""

import json
from pathlib import Path

from app.main import app

OUT = Path(__file__).resolve().parent.parent / "openapi.json"


def main() -> None:
    OUT.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
