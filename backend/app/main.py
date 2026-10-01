import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config.settings import settings
from app.database import init_db
from app.routers.auth import auth_router
from app.routers.tasks import tasks_router


logger = logging.getLogger("taskflow")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Keep the ASGI app importable even if the database is temporarily unreachable.
    # Auth/task routes will still fail clearly; health can report the real error.
    if settings.DATABASE_CONFIG_ERROR:
        app.state.db_ready = False
        app.state.db_error = settings.DATABASE_CONFIG_ERROR
        logger.error("Database configuration error: %s", settings.DATABASE_CONFIG_ERROR)
        yield
        return

    try:
        init_db()
        app.state.db_ready = True
        app.state.db_error = None
    except Exception as exc:  # noqa: BLE001 - surface any startup DB failure
        logger.exception("Database initialization failed")
        app.state.db_ready = False
        app.state.db_error = str(exc)
    yield


app = FastAPI(title="Task Manager API", version="1.0.0", lifespan=lifespan)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5500,http://127.0.0.1:5500,https://task-manager-frontend-self-chi.vercel.app",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks_router)
app.include_router(auth_router)


@app.get("/", tags=["Health"])
def health_check():
    if not getattr(app.state, "db_ready", True):
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "database": "unavailable",
                "detail": getattr(app.state, "db_error", "Database initialization failed"),
            },
        )
    return {"status": "ok"}
