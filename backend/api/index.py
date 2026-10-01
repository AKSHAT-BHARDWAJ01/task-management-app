"""Vercel entrypoint for the TaskFlow FastAPI application.

Prefer the explicit entrypoint in pyproject.toml (`app.main:app`).
This module remains as a compatible re-export for older Vercel Python layouts.
"""

from app.main import app

__all__ = ["app"]
