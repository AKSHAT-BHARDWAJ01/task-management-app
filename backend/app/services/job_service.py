"""The scheduler tick: reminders, digest, push delivery, and cleanup.

Something outside the API must call this on a schedule (GitHub Actions every
few minutes, plus a daily Vercel Cron as a backstop). Each run is safe to
repeat: a lease stops overlapping runs, and every reminder is keyed so a second
run cannot create it again.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import JobLease, Milestone, NotificationDelivery, ProjectMembership, Task, User
from app.services import event_service, notification_service, push_service

logger = logging.getLogger("taskflow.jobs")

TICK_LEASE_SECONDS = 120
TIME_BUDGET_SECONDS = 45
DELIVERY_RETENTION_DAYS = 30


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def acquire_lease(db: Session, name: str, seconds: int, now: datetime | None = None) -> str | None:
    now = now or _now()
    if db.get(JobLease, name) is None:
        db.add(JobLease(name=name, locked_until=now - timedelta(seconds=1)))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    holder = str(uuid.uuid4())
    result = db.execute(
        update(JobLease)
        .where(JobLease.name == name, JobLease.locked_until < now)
        .values(locked_until=now + timedelta(seconds=seconds), holder=holder, last_started_at=now)
    )
    db.commit()
    return holder if result.rowcount == 1 else None


def release_lease(db: Session, name: str, holder: str, result: dict) -> None:
    db.execute(
        update(JobLease)
        .where(JobLease.name == name, JobLease.holder == holder)
        .values(locked_until=_now(), last_finished_at=_now(), last_result=json.dumps(result, default=str)[:4000])
    )
    db.commit()


def users_with_reminders(db: Session) -> list[User]:
    """Anyone responsible for an open task deadline or a visible open milestone."""
    ids = set(
        db.scalars(
            select(Task.assignee_id).where(Task.assignee_id.is_not(None), Task.status != "completed", Task.due_date.is_not(None))
        ).all()
    )
    ids |= set(
        db.scalars(
            select(Task.user_id).where(
                Task.assignee_id.is_(None), Task.status != "completed", Task.due_date.is_not(None)
            )
        ).all()
    )
    open_milestone_projects = set(
        db.scalars(
            select(Milestone.project_id).where(Milestone.completed_at.is_(None), Milestone.target_date.is_not(None))
        ).all()
    )
    if open_milestone_projects:
        ids |= set(
            db.scalars(
                select(ProjectMembership.user_id).where(ProjectMembership.project_id.in_(open_milestone_projects))
            ).all()
        )
    ids.discard(None)
    if not ids:
        return []
    return list(db.scalars(select(User).where(User.id.in_(ids)).order_by(User.id)).all())


def run_reminders(db: Session, now_utc: datetime, deadline: float | None = None) -> dict:
    counts = {"users": 0, "created": 0, "errors": 0}
    aware = now_utc.replace(tzinfo=timezone.utc) if now_utc.tzinfo is None else now_utc
    for user in users_with_reminders(db):
        if deadline is not None and time.monotonic() > deadline:
            counts["truncated"] = True
            break
        counts["users"] += 1
        try:
            counts["created"] += len(notification_service.sync_reminders(db, user, None, aware))
        except Exception:  # noqa: BLE001 - one bad account must not stop everyone's reminders
            db.rollback()
            counts["errors"] += 1
            logger.exception("Reminder planning failed for user %s", user.id)
    return counts


def prune(db: Session, now: datetime) -> dict:
    events = event_service.prune(db, now)
    cutoff = now - timedelta(days=DELIVERY_RETENTION_DAYS)
    result = db.execute(
        delete(NotificationDelivery).where(
            NotificationDelivery.created_at < cutoff,
            or_(NotificationDelivery.status != "pending", NotificationDelivery.next_attempt_at < cutoff),
        )
    )
    db.commit()
    return {"events": events, "deliveries": result.rowcount or 0}


def run_tick(db: Session, now: datetime | None = None, **transports) -> dict:
    now = now or _now()
    holder = acquire_lease(db, "tick", TICK_LEASE_SECONDS, now)
    if holder is None:
        return {"status": "skipped", "reason": "Another run holds the lease"}
    deadline = time.monotonic() + TIME_BUDGET_SECONDS
    result: dict = {"status": "ok", "started_at": now.isoformat()}
    try:
        result["reminders"] = run_reminders(db, now, deadline)
        result["push"] = push_service.drain(
            db,
            now,
            deadline=deadline,
            expo_transport=transports.get("expo_transport"),
            web_transport=transports.get("web_transport"),
        )
        result["receipts"] = push_service.check_receipts(db, now, transport=transports.get("expo_transport"))
        result["pruned"] = prune(db, now)
    except Exception as exc:  # noqa: BLE001 - report the failure to the trigger, then release
        db.rollback()
        logger.exception("Scheduler tick failed")
        result = {**result, "status": "error", "error": type(exc).__name__}
    finally:
        release_lease(db, "tick", holder, result)
    return result
