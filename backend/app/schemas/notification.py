from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_serializer


def _as_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str
    message: str
    task_id: int | None
    created_at: datetime
    read_at: datetime | None

    @field_serializer("created_at", "read_at")
    def serialize_timestamp(self, value: datetime | None) -> str | None:
        return _as_utc(value)


class NotificationList(BaseModel):
    items: list[NotificationRead]
    unread_count: int
    total: int


class SyncRequest(BaseModel):
    timezone: str = "UTC"


class SyncResult(BaseModel):
    created: list[NotificationRead]
    browser_notifications_enabled: bool = False


class ReminderPreferencesRead(BaseModel):
    daily_reminders_enabled: bool
    daily_reminder_time: str
    overdue_reminders_enabled: bool
    browser_notifications_enabled: bool
    timezone: str


class ReminderPreferencesUpdate(BaseModel):
    daily_reminders_enabled: bool | None = None
    daily_reminder_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    overdue_reminders_enabled: bool | None = None
    browser_notifications_enabled: bool | None = None
    timezone: str | None = None
