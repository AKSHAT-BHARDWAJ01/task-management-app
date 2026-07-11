import os
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = BACKEND_DIR / "data" / "tasks.db"
load_dotenv(BACKEND_DIR / ".env")


class Config:
    """Runtime configuration for the FastAPI application."""

    DATABASE_URL = os.getenv(
        "DATABASE_URL", f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}"
    )


settings = Config()
