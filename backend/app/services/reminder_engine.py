"""Decide which reminders are due.

Deadlines saved from the task form are dates at midnight. Those are date-only:
they can appear in the daily summary and a once-only "due tomorrow" or overdue
notice. They never get a one-hour or "due now" alert, because no time was set.

A deadline with a clock time can use the 24-hour, 1-hour, and due-now windows.

This module does not send anything. The caller stores each result once, using
the idempotency key, so a refresh or a second tab cannot create it again.

Reminders are only calculated while the API is handling a signed-in request.
Nothing here runs while the browser is closed.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass(frozen=True)
class ReminderPreferences:
    daily_reminders_enabled: bool = True
    daily_reminder_minutes: int = 9 * 60
    overdue_reminders_enabled: bool = True
    timezone: str = "UTC"


@dataclass(frozen=True)
class PlannedNotification:
    idempotency_key: str
    type: str
    title: str
    message: str
    task_id: int | None


def resolve_zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name or "UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def is_date_only(due: datetime) -> bool:
    """Midnight means the user picked a date and did not set a time."""
    return due.hour == 0 and due.minute == 0 and due.second == 0 and due.microsecond == 0


def as_local(due: datetime, zone: ZoneInfo) -> datetime:
    if due.tzinfo is None:
        return due.replace(tzinfo=zone)
    return due.astimezone(zone)


def local_now(now_utc: datetime, zone: ZoneInfo) -> datetime:
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    return now_utc.astimezone(zone)


def plan_reminders(tasks, preferences: ReminderPreferences, now_utc: datetime, existing_keys: set[str]) -> list[PlannedNotification]:
    zone = resolve_zone(preferences.timezone)
    now = local_now(now_utc, zone)
    today = now.date()
    planned: list[PlannedNotification] = []
    due_today: list = []
    overdue: list = []

    for task in tasks:
        if getattr(task, "status", None) == "completed" or getattr(task, "due_date", None) is None:
            continue
        due = as_local(task.due_date, zone)
        if is_date_only(task.due_date):
            _plan_date_only(task, due.date(), today, preferences, due_today, overdue, planned)
        else:
            _plan_timed(task, due, now, preferences, overdue, planned)

    summary = _daily_summary(preferences, now, today, due_today, overdue)
    if summary is not None:
        planned.append(summary)

    return [item for item in planned if item.idempotency_key not in existing_keys]


def _plan_date_only(task, due_day, today, preferences, due_today, overdue, planned) -> None:
    if due_day == today:
        due_today.append(task)
        return
    if due_day == today + timedelta(days=1):
        planned.append(PlannedNotification(
            idempotency_key=f"upcoming:{task.id}:{_day_key(task.due_date)}:1d",
            type="deadline",
            title="Deadline approaching",
            message=f"Deadline approaching: {task.title} is due tomorrow.",
            task_id=task.id,
        ))
        return
    if due_day < today and preferences.overdue_reminders_enabled:
        overdue.append(task)
        days = (today - due_day).days
        day_word = "day" if days == 1 else "days"
        planned.append(PlannedNotification(
            idempotency_key=f"overdue:{task.id}:{_day_key(task.due_date)}",
            type="overdue",
            title="Task overdue",
            message=f"Your {task.title} task is overdue by {days} {day_word}.",
            task_id=task.id,
        ))


def _plan_timed(task, due, now, preferences, overdue, planned) -> None:
    delta = due - now
    due_key = task.due_date.isoformat()
    if timedelta(hours=1) < delta <= timedelta(hours=24):
        when = "tomorrow" if due.date() == now.date() + timedelta(days=1) else "in 24 hours"
        planned.append(PlannedNotification(
            idempotency_key=f"upcoming:{task.id}:{due_key}:24h",
            type="deadline",
            title="Deadline approaching",
            message=f"Deadline approaching: {task.title} is due {when}.",
            task_id=task.id,
        ))
    elif timedelta(0) < delta <= timedelta(hours=1):
        planned.append(PlannedNotification(
            idempotency_key=f"soon:{task.id}:{due_key}:1h",
            type="deadline",
            title="Due soon",
            message=f"Due soon: {task.title} in one hour.",
            task_id=task.id,
        ))
    elif timedelta(hours=-1) <= delta <= timedelta(0):
        planned.append(PlannedNotification(
            idempotency_key=f"due:{task.id}:{due_key}:now",
            type="due_today",
            title="Due now",
            message=f"Due now: {task.title}.",
            task_id=task.id,
        ))
    elif delta < timedelta(hours=-1) and preferences.overdue_reminders_enabled:
        overdue.append(task)
        days = max((now.date() - due.date()).days, 1)
        day_word = "day" if days == 1 else "days"
        planned.append(PlannedNotification(
            idempotency_key=f"overdue:{task.id}:{_day_key(task.due_date)}",
            type="overdue",
            title="Task overdue",
            message=f"Your {task.title} task is overdue by {days} {day_word}.",
            task_id=task.id,
        ))


def _daily_summary(preferences, now, today, due_today, overdue) -> PlannedNotification | None:
    if not preferences.daily_reminders_enabled:
        return None
    if now.hour * 60 + now.minute < preferences.daily_reminder_minutes:
        return None
    overdue_for_summary = overdue if preferences.overdue_reminders_enabled else []
    if not due_today and not overdue_for_summary:
        return None

    parts = []
    if due_today:
        count = len(due_today)
        parts.append(f"{count} {'task' if count == 1 else 'tasks'} due today")
    if overdue_for_summary:
        count = len(overdue_for_summary)
        parts.append(f"{count} overdue {'task' if count == 1 else 'tasks'}")
    message = f"You have {' and '.join(parts)}."

    attention = [*due_today, *overdue_for_summary]
    high = next((task for task in attention if task.priority == "high"), None)
    if high is not None:
        message += f" High priority: {high.title}."
    if due_today:
        shown = due_today[:3]
        names = _join([task.title for task in shown])
        if len(due_today) > 3:
            names += f", and {len(due_today) - 3} more"
        message += f" Due today: {names}."

    return PlannedNotification(
        idempotency_key=f"summary:{today.isoformat()}",
        type="summary",
        title="Good morning! Here's your TaskFlow reminder.",
        message=message,
        task_id=None,
    )


def _day_key(due: datetime) -> str:
    return due.date().isoformat()


def _join(names: list[str]) -> str:
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return ", ".join(names[:-1]) + f", and {names[-1]}"


def parse_reminder_time(value: str) -> int:
    """Return minutes from local midnight, or raise ValueError."""
    parsed = time.fromisoformat(value)
    return parsed.hour * 60 + parsed.minute


def format_reminder_time(minutes: int) -> str:
    bounded = min(max(int(minutes), 0), 23 * 60 + 59)
    return f"{bounded // 60:02d}:{bounded % 60:02d}"
