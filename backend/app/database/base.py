from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config.settings import settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""


is_sqlite = settings.DATABASE_URL.startswith("sqlite")

if is_sqlite:
    connect_args: dict = {"check_same_thread": False}
    engine_kwargs: dict = {}
else:
    # Serverless-friendly settings: no persistent pool, fail fast on bad networks.
    connect_args = {
        "prepare_threshold": None,
        "connect_timeout": 10,
    }
    engine_kwargs = {
        "poolclass": NullPool,
        "pool_pre_ping": True,
    }

engine: Engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    """Provide one database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create the task tables and apply the small legacy schema upgrades."""
    from app.models.task import Task  # noqa: F401
    from app.models.user import User  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _add_missing_task_columns()
    _add_missing_user_columns()


def _add_missing_task_columns() -> None:
    """Apply the small schema changes needed by this assignment without losing data."""
    if "task" not in inspect(engine).get_table_names():
        return

    existing_columns = {column["name"] for column in inspect(engine).get_columns("task")}
    date_type = "DATETIME" if is_sqlite else "TIMESTAMP"
    migrations = {
        "priority": "VARCHAR(10) NOT NULL DEFAULT 'medium'",
        "progress": "INTEGER NOT NULL DEFAULT 0",
        "start_date": date_type,
        "due_date": date_type,
        "category": "VARCHAR(100)",
        "user_id": "INTEGER",
    }

    with engine.begin() as connection:
        for column, definition in migrations.items():
            if column not in existing_columns:
                connection.execute(text(f"ALTER TABLE task ADD COLUMN {column} {definition}"))


def _add_missing_user_columns() -> None:
    """Add a display name to accounts created before profile support was added."""
    if "users" not in inspect(engine).get_table_names():
        return

    existing_columns = {column["name"] for column in inspect(engine).get_columns("users")}
    if "name" not in existing_columns:
        name_from_email = (
            "substr(email, 1, instr(email, '@') - 1)"
            if is_sqlite
            else "split_part(email, '@', 1)"
        )
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(100)"))
            connection.execute(
                text(
                    f"UPDATE users SET name = {name_from_email} "
                    "WHERE name IS NULL OR name = ''"
                )
            )
