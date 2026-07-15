import sys
from pathlib import Path

from mangum import Mangum

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app as fastapi_app

# Vercel's Python runtime expects a module-level ASGI app.
application = Mangum(fastapi_app, lifespan="off")
