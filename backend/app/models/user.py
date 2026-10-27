from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, false, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    daily_reminders_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    daily_reminder_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=540, server_default="540")
    overdue_reminders_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    browser_notifications_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    reminder_timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC", server_default="UTC")

    tasks: Mapped[list["Task"]] = relationship(back_populates="user")
