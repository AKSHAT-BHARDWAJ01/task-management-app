import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = BACKEND_DIR / "data" / "tasks.db"
# Ephemeral path used only so the ASGI app can import on Vercel when misconfigured.
FALLBACK_SQLITE_PATH = Path("/tmp/taskflow-unconfigured.db")
load_dotenv(BACKEND_DIR / ".env")

# Vercel sets VERCEL=1 in all deployments (production and preview).
IS_VERCEL = os.getenv("VERCEL", "").strip() == "1"


def get_database_url() -> tuple[str, str | None]:
    """Return (database_url, config_error).

    On Vercel, never raise during import: return a temporary SQLite URL plus an
    error message so the health endpoint can report what is wrong.
    """
    database_url = os.getenv("DATABASE_URL", "").strip()

    if not database_url:
        if IS_VERCEL:
            return (
                f"sqlite:///{FALLBACK_SQLITE_PATH.as_posix()}",
                "DATABASE_URL is required on Vercel. Set it to your Supabase "
                "PostgreSQL connection string in the project Environment Variables.",
            )
        DEFAULT_DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}", None

    if database_url.startswith("sqlite"):
        if IS_VERCEL:
            return (
                f"sqlite:///{FALLBACK_SQLITE_PATH.as_posix()}",
                "SQLite is not supported on Vercel. Set DATABASE_URL to your "
                "Supabase PostgreSQL connection string.",
            )
        return database_url, None

    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    if database_url.startswith("postgresql://"):
        database_url = database_url.replace(
            "postgresql://", "postgresql+psycopg://", 1
        )

    if not database_url.startswith("postgresql+psycopg://"):
        error = "DATABASE_URL must be a SQLite or PostgreSQL connection string."
        if IS_VERCEL:
            return f"sqlite:///{FALLBACK_SQLITE_PATH.as_posix()}", error
        raise RuntimeError(error)

    # Supabase requires TLS. Keep existing query params intact.
    if "supabase.com" in database_url and "sslmode=" not in database_url:
        separator = "&" if "?" in database_url else "?"
        database_url = f"{database_url}{separator}sslmode=require"

    try:
        _validate_postgres_url(database_url)
    except RuntimeError as exc:
        if IS_VERCEL:
            return f"sqlite:///{FALLBACK_SQLITE_PATH.as_posix()}", str(exc)
        raise

    return database_url, None


def _validate_postgres_url(database_url: str) -> None:
    """Fail fast on obviously broken connection strings (e.g. unescaped @ in password)."""
    parsed = urlparse(database_url)
    if not parsed.hostname:
        raise RuntimeError(
            "DATABASE_URL is missing a hostname. If the database password contains "
            "special characters such as @, #, or /, URL-encode them first "
            "(for example, @ becomes %40)."
        )

    # Count raw '@' markers in the authority. A password that still contains a
    # literal '@' (not URL-encoded as %40) produces more than one separator.
    authority = database_url.split("://", 1)[1].split("/", 1)[0].split("?", 1)[0]
    if authority.count("@") != 1:
        raise RuntimeError(
            "DATABASE_URL looks malformed (extra '@' in the credentials). "
            "URL-encode special characters in the password (for example, @ becomes %40)."
        )


_database_url, _database_config_error = get_database_url()


class Config:
    """Runtime configuration for the FastAPI application."""

    DATABASE_URL = _database_url
    DATABASE_CONFIG_ERROR = _database_config_error
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-development-secret")
    JWT_ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))


settings = Config()
