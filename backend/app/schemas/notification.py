import re
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator


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
    event_type: str | None = None
    actor_user_id: int | None = None
    workspace_id: int | None = None
    project_id: int | None = None
    entity_type: str | None = None
    entity_id: int | None = None
    link: str | None = None

    @field_serializer("created_at", "read_at")
    def serialize_timestamp(self, value: datetime | None) -> str | None:
        return _as_utc(value)


class NotificationList(BaseModel):
    items: list[NotificationRead]
    unread_count: int
    total: int


class UnreadCount(BaseModel):
    unread_count: int


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
    upcoming_reminders_enabled: bool = True
    due_soon_reminders_enabled: bool = True
    push_enabled: bool = True
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "07:00"


TIME_PATTERN = r"^\d{2}:\d{2}$"


class ReminderPreferencesUpdate(BaseModel):
    daily_reminders_enabled: bool | None = None
    daily_reminder_time: str | None = Field(default=None, pattern=TIME_PATTERN)
    overdue_reminders_enabled: bool | None = None
    browser_notifications_enabled: bool | None = None
    timezone: str | None = None
    upcoming_reminders_enabled: bool | None = None
    due_soon_reminders_enabled: bool | None = None
    push_enabled: bool | None = None
    quiet_hours_enabled: bool | None = None
    quiet_hours_start: str | None = Field(default=None, pattern=TIME_PATTERN)
    quiet_hours_end: str | None = Field(default=None, pattern=TIME_PATTERN)


class WebPushKeys(BaseModel):
    p256dh: str = Field(min_length=16, max_length=255)
    auth: str = Field(min_length=8, max_length=255)


EXPO_TOKEN_PATTERN = r"^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{8,}\]$"


class PushTokenRegister(BaseModel):
    device_id: str = Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9._:\-]+$")
    platform: Literal["ios", "android", "web"]
    provider: Literal["expo", "webpush"]
    token: str = Field(min_length=10, max_length=2048)
    keys: WebPushKeys | None = None
    app_version: str | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def check_provider(self):
        if self.provider == "expo":
            if self.platform == "web":
                raise ValueError("Expo tokens are for iOS or Android devices")
            if not re.match(EXPO_TOKEN_PATTERN, self.token):
                raise ValueError("That is not an Expo push token")
            if self.keys is not None:
                raise ValueError("Expo tokens do not take web push keys")
        else:
            if self.platform != "web":
                raise ValueError("Web push subscriptions are for browsers")
            if not self.token.startswith("https://"):
                raise ValueError("A web push endpoint must be an https URL")
            if self.keys is None:
                raise ValueError("Web push subscriptions need their p256dh and auth keys")
        return self


class DeviceRead(BaseModel):
    id: int
    device_id: str
    platform: str
    provider: str
    token_preview: str | None
    app_version: str | None
    created_at: datetime
    last_seen_at: datetime
    active: bool
    disabled_reason: str | None = None

    @field_serializer("created_at", "last_seen_at")
    def serialize_timestamp(self, value: datetime | None) -> str | None:
        return _as_utc(value)


class WebPushConfig(BaseModel):
    enabled: bool
    public_key: str | None


class EventEntity(BaseModel):
    type: str
    id: int | None


class EventEnvelope(BaseModel):
    id: int
    event_id: str
    type: str
    version: int
    occurred_at: str | None
    workspace_id: int | None
    project_id: int | None
    entity: EventEntity
    actor_id: int | None
    data: dict


class EventFeed(BaseModel):
    events: list[EventEnvelope]
    cursor: int
    has_more: bool
    reset: bool
    server_time: str
