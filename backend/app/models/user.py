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
    upcoming_reminders_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    due_soon_reminders_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    push_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    quiet_hours_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    quiet_hours_start_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=1320, server_default="1320")
    quiet_hours_end_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=420, server_default="420")

    tasks: Mapped[list["Task"]] = relationship(back_populates="user", foreign_keys="Task.user_id")
