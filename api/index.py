import sys
from pathlib import Path

# Used only if the API is deployed from the monorepo root.
# The production API project should use backend/ as its Vercel Root Directory.
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402

__all__ = ["app"]
