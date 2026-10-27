from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Notification, Task, User
from app.services.reminder_engine import (
    ReminderPreferences,
    format_reminder_time,
    parse_reminder_time,
    plan_reminders,
    resolve_zone,
)


def preferences_from_user(user: User) -> ReminderPreferences:
    return ReminderPreferences(
        daily_reminders_enabled=bool(user.daily_reminders_enabled),
        daily_reminder_minutes=int(user.daily_reminder_minutes or 540),
        overdue_reminders_enabled=bool(user.overdue_reminders_enabled),
        timezone=user.reminder_timezone or "UTC",
    )


def preferences_payload(user: User) -> dict:
    return {
        "daily_reminders_enabled": bool(user.daily_reminders_enabled),
        "daily_reminder_time": format_reminder_time(user.daily_reminder_minutes or 540),
        "overdue_reminders_enabled": bool(user.overdue_reminders_enabled),
        "browser_notifications_enabled": bool(user.browser_notifications_enabled),
        "timezone": user.reminder_timezone or "UTC",
    }


def update_preferences(db: Session, user: User, data: dict) -> dict:
    if "timezone" in data and data["timezone"]:
        user.reminder_timezone = str(resolve_zone(data["timezone"]))
    if "daily_reminders_enabled" in data:
        user.daily_reminders_enabled = bool(data["daily_reminders_enabled"])
    if "overdue_reminders_enabled" in data:
        user.overdue_reminders_enabled = bool(data["overdue_reminders_enabled"])
    if "browser_notifications_enabled" in data:
        user.browser_notifications_enabled = bool(data["browser_notifications_enabled"])
    if data.get("daily_reminder_time"):
        user.daily_reminder_minutes = parse_reminder_time(data["daily_reminder_time"])
    db.commit()
    db.refresh(user)
    return preferences_payload(user)


def list_notifications(db: Session, user_id: int, limit: int, offset: int) -> dict:
    owned = Notification.user_id == user_id
    total = db.scalar(select(func.count()).select_from(Notification).where(owned)) or 0
    unread = db.scalar(
        select(func.count()).select_from(Notification).where(owned, Notification.read_at.is_(None))
    ) or 0
    items = list(
        db.scalars(
            select(Notification)
            .where(owned)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )
    return {"items": items, "unread_count": unread, "total": total}


def mark_read(db: Session, user_id: int, notification_id: int) -> Notification | None:
    notice = db.scalar(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user_id)
    )
    if notice is None:
        return None
    if notice.read_at is None:
        notice.read_at = datetime.utcnow()
        db.commit()
        db.refresh(notice)
    return notice


def mark_all_read(db: Session, user_id: int) -> int:
    notices = list(
        db.scalars(
            select(Notification).where(Notification.user_id == user_id, Notification.read_at.is_(None))
        ).all()
    )
    now = datetime.utcnow()
    for notice in notices:
        notice.read_at = now
    db.commit()
    return len(notices)


def dismiss(db: Session, user_id: int, notification_id: int) -> bool:
    notice = db.scalar(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user_id)
    )
    if notice is None:
        return False
    db.delete(notice)
    db.commit()
    return True


def detach_task(db: Session, user_id: int, task_id: int) -> None:
    notices = list(
        db.scalars(
            select(Notification).where(Notification.user_id == user_id, Notification.task_id == task_id)
        ).all()
    )
    for notice in notices:
        notice.task_id = None


def record_completion(db: Session, task: Task) -> Notification | None:
    stamp = task.updated_at.isoformat() if task.updated_at else "once"
    return _insert(
        db,
        user_id=task.user_id,
        type="completed",
        title="Task completed",
        message=f"Task completed: {task.title}.",
        task_id=task.id,
        idempotency_key=f"completed:{task.id}:{stamp}",
    )


def sync_reminders(db: Session, user: User, timezone_name: str | None, now: datetime | None = None) -> list[Notification]:
    if timezone_name:
        user.reminder_timezone = str(resolve_zone(timezone_name))
        db.commit()
        db.refresh(user)

    tasks = list(db.scalars(select(Task).where(Task.user_id == user.id)).all())
    existing = set(
        db.scalars(select(Notification.idempotency_key).where(Notification.user_id == user.id)).all()
    )
    planned = plan_reminders(
        tasks,
        preferences_from_user(user),
        now or datetime.now(timezone.utc),
        existing,
    )
    created = []
    for item in planned:
        notice = _insert(
            db,
            user_id=user.id,
            type=item.type,
            title=item.title,
            message=item.message,
            task_id=item.task_id,
            idempotency_key=item.idempotency_key,
        )
        if notice is not None:
            created.append(notice)
            existing.add(item.idempotency_key)
    return created


def _insert(db: Session, **fields) -> Notification | None:
    notice = Notification(created_at=datetime.utcnow(), **fields)
    db.add(notice)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    db.refresh(notice)
    return notice
