from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class DomainEvent(Base):
    """Append-only change log. The id is the sync cursor clients poll from."""

    __tablename__ = "domain_event"
    __table_args__ = (Index("ix_domain_event_scope", "workspace_id", "project_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    workspace_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    project_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Set only for events meant for one person (personal tasks, their notifications).
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class DevicePushToken(Base):
    __tablename__ = "device_push_token"
    __table_args__ = (UniqueConstraint("user_id", "device_id", name="uq_device_push_token_user_device"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    device_id: Mapped[str] = mapped_column(String(128), nullable=False)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    token: Mapped[str] = mapped_column(Text, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    web_p256dh: Mapped[str | None] = mapped_column(String(255), nullable=True)
    web_auth: Mapped[str | None] = mapped_column(String(255), nullable=True)
    app_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    disabled_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)


class NotificationDelivery(Base):
    """Outbox row: one push attempt stream per notification per device."""

    __tablename__ = "notification_delivery"
    __table_args__ = (
        UniqueConstraint("notification_id", "device_token_id", name="uq_delivery_notice_device"),
        Index("ix_notification_delivery_due", "status", "next_attempt_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    notification_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    device_token_id: Mapped[int] = mapped_column(Integer, nullable=False)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    provider_ticket_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    receipt_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class JobLease(Base):
    """Prevents two scheduler triggers from running the same job at once."""

    __tablename__ = "job_lease"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    locked_until: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    holder: Mapped[str | None] = mapped_column(String(36), nullable=True)
    last_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_result: Mapped[str | None] = mapped_column(Text, nullable=True)
