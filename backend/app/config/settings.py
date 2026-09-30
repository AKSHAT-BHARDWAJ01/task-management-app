import os
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = BACKEND_DIR / "data" / "tasks.db"
load_dotenv(BACKEND_DIR / ".env")


def get_database_url() -> str:
    """Return the configured database URL in SQLAlchemy format."""
    database_url = os.getenv("DATABASE_URL", "").strip()

    if not database_url:
        DEFAULT_DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}"

    if database_url.startswith("sqlite"):
        return database_url

    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    if database_url.startswith("postgresql://"):
        database_url = database_url.replace(
            "postgresql://", "postgresql+psycopg://", 1
        )

    if not database_url.startswith("postgresql+psycopg://"):
        raise RuntimeError(
            "DATABASE_URL must be a SQLite or PostgreSQL connection string."
        )

    return database_url


class Config:
    """Runtime configuration for the FastAPI application."""

    DATABASE_URL = get_database_url()
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-development-secret")
    JWT_ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))


settings = Config()
