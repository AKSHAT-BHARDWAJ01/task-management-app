from collections.abc import Iterable
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    DevicePushToken,
    DomainEvent,
    Milestone,
    Notification,
    NotificationDelivery,
    Project,
    ProjectMembership,
    Task,
    User,
    WorkspaceMembership,
)
from app.services import event_service
from app.services.reminder_engine import (
    ReminderPreferences,
    format_reminder_time,
    local_now,
    parse_reminder_time,
    plan_milestone_reminders,
    plan_reminders,
    resolve_zone,
)

REMINDER_TYPES = frozenset({"deadline", "overdue", "due_today", "summary", "milestone"})


def task_link(task_id: int) -> str:
    return f"/tasks/{task_id}"


def project_link(project_id: int) -> str:
    return f"/projects/{project_id}"


def workspace_link(workspace_id: int) -> str:
    return f"/workspaces/{workspace_id}"


INVITATIONS_LINK = "/invitations"
WORKSPACES_LINK = "/workspaces"


def preferences_from_user(user: User) -> ReminderPreferences:
    return ReminderPreferences(
        daily_reminders_enabled=bool(user.daily_reminders_enabled),
        daily_reminder_minutes=int(user.daily_reminder_minutes or 540),
        overdue_reminders_enabled=bool(user.overdue_reminders_enabled),
        timezone=user.reminder_timezone or "UTC",
        upcoming_reminders_enabled=_flag(user.upcoming_reminders_enabled),
        due_soon_reminders_enabled=_flag(user.due_soon_reminders_enabled),
    )


def _flag(value, default: bool = True) -> bool:
    return default if value is None else bool(value)


def preferences_payload(user: User) -> dict:
    return {
        "daily_reminders_enabled": bool(user.daily_reminders_enabled),
        "daily_reminder_time": format_reminder_time(user.daily_reminder_minutes or 540),
        "overdue_reminders_enabled": bool(user.overdue_reminders_enabled),
        "browser_notifications_enabled": bool(user.browser_notifications_enabled),
        "timezone": user.reminder_timezone or "UTC",
        "upcoming_reminders_enabled": _flag(user.upcoming_reminders_enabled),
        "due_soon_reminders_enabled": _flag(user.due_soon_reminders_enabled),
        "push_enabled": _flag(user.push_enabled),
        "quiet_hours_enabled": _flag(user.quiet_hours_enabled, False),
        "quiet_hours_start": format_reminder_time(_minutes(user.quiet_hours_start_minutes, 1320)),
        "quiet_hours_end": format_reminder_time(_minutes(user.quiet_hours_end_minutes, 420)),
    }


def _minutes(value, default: int) -> int:
    return default if value is None else int(value)


BOOLEAN_PREFERENCES = (
    "daily_reminders_enabled",
    "overdue_reminders_enabled",
    "browser_notifications_enabled",
    "upcoming_reminders_enabled",
    "due_soon_reminders_enabled",
    "push_enabled",
    "quiet_hours_enabled",
)


def update_preferences(db: Session, user: User, data: dict) -> dict:
    if "timezone" in data and data["timezone"]:
        user.reminder_timezone = str(resolve_zone(data["timezone"]))
    for name in BOOLEAN_PREFERENCES:
        if name in data and data[name] is not None:
            setattr(user, name, bool(data[name]))
    if data.get("daily_reminder_time"):
        user.daily_reminder_minutes = parse_reminder_time(data["daily_reminder_time"])
    if data.get("quiet_hours_start"):
        user.quiet_hours_start_minutes = parse_reminder_time(data["quiet_hours_start"])
    if data.get("quiet_hours_end"):
        user.quiet_hours_end_minutes = parse_reminder_time(data["quiet_hours_end"])
    event_service.emit(db, "preferences.updated", entity_type="user", entity_id=user.id, actor_id=user.id, user_id=user.id)
    db.commit()
    db.refresh(user)
    return preferences_payload(user)


def quiet_hours_end(user: User, now_utc: datetime) -> datetime | None:
    """Return the naive-UTC moment quiet hours end, or None when push may go now."""
    if not _flag(user.quiet_hours_enabled, False):
        return None
    start = _minutes(user.quiet_hours_start_minutes, 1320)
    end = _minutes(user.quiet_hours_end_minutes, 420)
    if start == end:
        return None
    zone = resolve_zone(user.reminder_timezone or "UTC")
    now = local_now(now_utc, zone)
    minute = now.hour * 60 + now.minute
    inside = start <= minute < end if start < end else (minute >= start or minute < end)
    if not inside:
        return None
    day = now.date() if minute < end else now.date() + timedelta(days=1)
    local_end = datetime(day.year, day.month, day.day, end // 60, end % 60, tzinfo=zone)
    return local_end.astimezone(timezone.utc).replace(tzinfo=None)


def _visible(user_id: int):
    return (Notification.user_id == user_id) & Notification.dismissed_at.is_(None)


def list_notifications(db: Session, user_id: int, limit: int, offset: int) -> dict:
    owned = _visible(user_id)
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


def unread_count(db: Session, user_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Notification).where(_visible(user_id), Notification.read_at.is_(None))
    ) or 0


def _cancel_pending_deliveries(db: Session, notification_ids: list[int]) -> None:
    if not notification_ids:
        return
    db.query(NotificationDelivery).filter(
        NotificationDelivery.notification_id.in_(notification_ids),
        NotificationDelivery.status == "pending",
    ).update({NotificationDelivery.status: "cancelled"}, synchronize_session=False)


def mark_read(db: Session, user_id: int, notification_id: int) -> Notification | None:
    notice = db.scalar(
        select(Notification).where(Notification.id == notification_id, _visible(user_id))
    )
    if notice is None:
        return None
    if notice.read_at is None:
        notice.read_at = datetime.utcnow()
        _cancel_pending_deliveries(db, [notice.id])
        event_service.emit(
            db, "notification.read", entity_type="notification", entity_id=notice.id, actor_id=user_id, user_id=user_id,
            data={"ids": [notice.id]},
        )
        db.commit()
        db.refresh(notice)
    return notice


def mark_all_read(db: Session, user_id: int) -> int:
    notices = list(
        db.scalars(
            select(Notification).where(_visible(user_id), Notification.read_at.is_(None))
        ).all()
    )
    now = datetime.utcnow()
    for notice in notices:
        notice.read_at = now
    if notices:
        _cancel_pending_deliveries(db, [notice.id for notice in notices])
        event_service.emit(
            db, "notification.read", entity_type="notification", entity_id=None, actor_id=user_id, user_id=user_id,
            data={"all": True},
        )
    db.commit()
    return len(notices)


def dismiss(db: Session, user_id: int, notification_id: int) -> bool:
    notice = db.scalar(
        select(Notification).where(Notification.id == notification_id, _visible(user_id))
    )
    if notice is None:
        return False
    _cancel_pending_deliveries(db, [notice.id])
    event_service.emit(
        db, "notification.deleted", entity_type="notification", entity_id=notice.id, actor_id=user_id, user_id=user_id,
    )
    now = datetime.utcnow()
    notice.dismissed_at = now
    notice.read_at = notice.read_at or now
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
        if notice.link == task_link(task_id):
            notice.link = None


def _task_context(task: Task) -> dict:
    return {
        "task_id": task.id,
        "workspace_id": task.workspace_id,
        "project_id": task.project_id,
        "entity_type": "task",
        "entity_id": task.id,
        "link": task_link(task.id),
    }


def record_created(db: Session, task: Task, actor_id: int | None = None) -> Notification | None:
    return _insert(
        db,
        user_id=task.user_id,
        type="created",
        title="Task created",
        message=f"Task created: {task.title}.",
        idempotency_key=f"created:{task.id}",
        event_type="task.created",
        actor_user_id=actor_id or task.user_id,
        **_task_context(task),
    )


def record_updated(db: Session, task: Task, actor_id: int | None = None) -> Notification | None:
    return _insert(
        db,
        user_id=task.user_id,
        type="updated",
        title="Task updated",
        message=f"Task updated: {task.title}.",
        idempotency_key=f"updated:{task.id}:{_stamp(task)}",
        event_type="task.updated",
        actor_user_id=actor_id or task.user_id,
        **_task_context(task),
    )


def record_reopened(db: Session, task: Task, actor_id: int | None = None) -> Notification | None:
    return _insert(
        db,
        user_id=task.user_id,
        type="reopened",
        title="Task reopened",
        message=f"Task reopened: {task.title}.",
        idempotency_key=f"reopened:{task.id}:{_stamp(task)}",
        event_type="task.reopened",
        actor_user_id=actor_id or task.user_id,
        **_task_context(task),
    )


def record_deleted(db: Session, task: Task, actor_id: int | None = None) -> Notification | None:
    return _insert(
        db,
        user_id=task.user_id,
        type="deleted",
        title="Task deleted",
        message=f"Task deleted: {task.title}.",
        task_id=None,
        idempotency_key=f"deleted:{task.id}",
        event_type="task.deleted",
        actor_user_id=actor_id or task.user_id,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        entity_type="task",
        entity_id=task.id,
    )


def _stamp(task: Task) -> str:
    return task.updated_at.isoformat() if task.updated_at else "once"


def record_completion(db: Session, task: Task, actor_id: int | None = None) -> Notification | None:
    return _insert(
        db,
        user_id=task.user_id,
        type="completed",
        title="Task completed",
        message=f"Task completed: {task.title}.",
        idempotency_key=f"completed:{task.id}:{_stamp(task)}",
        event_type="task.completed",
        actor_user_id=actor_id or task.user_id,
        **_task_context(task),
    )


def notify_users(
    db: Session,
    recipients: Iterable[int | None],
    event: DomainEvent,
    *,
    type: str,
    title: str,
    message: str,
    link: str | None,
    task_id: int | None = None,
    include_actor: bool = False,
) -> list[Notification]:
    """Create one notice per recipient, keyed by the event so retries cannot duplicate it."""
    skip = {None} if include_actor else {None, event.actor_user_id}
    created = []
    for user_id in sorted({item for item in recipients} - skip):
        notice = _insert(
            db,
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            task_id=task_id,
            idempotency_key=f"{event.type}:{event.event_id}:{user_id}",
            event_type=event.type,
            actor_user_id=event.actor_user_id,
            workspace_id=event.workspace_id,
            project_id=event.project_id,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            link=link,
        )
        if notice is not None:
            created.append(notice)
    return created


def project_member_ids(db: Session, project_id: int) -> set[int]:
    return set(db.scalars(select(ProjectMembership.user_id).where(ProjectMembership.project_id == project_id)).all())


def can_view_task(db: Session, user_id: int, task: Task) -> bool:
    if task.project_id is None:
        return task.user_id == user_id
    from app.services import collaboration_service

    user = db.get(User, user_id)
    if user is None:
        return False
    try:
        collaboration_service.require_project(db, user, task.project_id)
    except collaboration_service.CollaborationError:
        return False
    return True


def notify_task_collaborators(db: Session, task: Task, event: DomainEvent, verb: str, type: str) -> list[Notification]:
    """Project tasks: tell the assignee about changes someone else made.

    The owner already receives the legacy task notice, so they are skipped here.
    """
    if task.project_id is None or not task.assignee_id or task.assignee_id == task.user_id:
        return []
    if not can_view_task(db, task.assignee_id, task):
        return []
    actor = db.get(User, event.actor_user_id) if event.actor_user_id else None
    name = actor.name if actor else "Someone"
    return notify_users(
        db,
        [task.assignee_id],
        event,
        type=type,
        title=f"Task {verb}",
        message=f"{name} {verb} {task.title}.",
        link=task_link(task.id) if type != "deleted" else project_link(task.project_id),
        task_id=task.id if type != "deleted" else None,
    )


def notify_assignment(db: Session, task: Task, event: DomainEvent) -> list[Notification]:
    if not task.assignee_id or not can_view_task(db, task.assignee_id, task):
        return []
    actor = db.get(User, event.actor_user_id) if event.actor_user_id else None
    project = db.get(Project, task.project_id) if task.project_id else None
    where = f" in {project.name}" if project else ""
    return notify_users(
        db,
        [task.assignee_id],
        event,
        type="assigned",
        title="Task assigned to you",
        message=f"{actor.name if actor else 'Someone'} assigned you {task.title}{where}.",
        link=task_link(task.id),
        task_id=task.id,
    )


def responsible_tasks(db: Session, user_id: int) -> list[Task]:
    """Tasks whose reminders belong to this person.

    Personal tasks remind their owner. Project tasks remind the assignee, or the
    creator while nobody is assigned, and only while that person can still see them.
    """
    rows = db.scalars(
        select(Task).where(
            Task.status != "completed",
            Task.due_date.is_not(None),
            or_(Task.assignee_id == user_id, (Task.user_id == user_id) & (Task.assignee_id.is_(None))),
        )
    ).all()
    return [task for task in rows if task.project_id is None or can_view_task(db, user_id, task)]


def visible_open_milestones(db: Session, user_id: int) -> list[Milestone]:
    """Open milestones on projects the user can currently see."""
    from app.services import collaboration_service

    user = db.get(User, user_id)
    if user is None:
        return []
    memberships = list(
        db.scalars(select(ProjectMembership.project_id).where(ProjectMembership.user_id == user_id)).all()
    )
    workspace_ids = list(
        db.scalars(select(WorkspaceMembership.workspace_id).where(WorkspaceMembership.user_id == user_id)).all()
    )
    project_ids = set(memberships)
    if workspace_ids:
        shared = db.execute(
            select(Project.id, Project.visibility, Project.workspace_id).where(Project.workspace_id.in_(workspace_ids))
        ).all()
        roles = dict(
            db.execute(
                select(WorkspaceMembership.workspace_id, WorkspaceMembership.role).where(
                    WorkspaceMembership.user_id == user_id
                )
            ).all()
        )
        for project_id, visibility, workspace_id in shared:
            if roles.get(workspace_id) in {"owner", "admin"} or visibility == "workspace" or project_id in project_ids:
                project_ids.add(project_id)
    if not project_ids:
        return []
    rows = list(
        db.scalars(
            select(Milestone).where(
                Milestone.project_id.in_(project_ids),
                Milestone.completed_at.is_(None),
                Milestone.target_date.is_not(None),
            )
        ).all()
    )
    visible = []
    for milestone in rows:
        try:
            collaboration_service.require_project(db, user, milestone.project_id)
        except collaboration_service.CollaborationError:
            continue
        visible.append(milestone)
    return visible


def sync_reminders(db: Session, user: User, timezone_name: str | None, now: datetime | None = None) -> list[Notification]:
    if timezone_name:
        user.reminder_timezone = str(resolve_zone(timezone_name))
        db.commit()
        db.refresh(user)

    moment = now or datetime.now(timezone.utc)
    preferences = preferences_from_user(user)
    tasks = responsible_tasks(db, user.id)
    milestones = visible_open_milestones(db, user.id)
    existing = set(
        db.scalars(select(Notification.idempotency_key).where(Notification.user_id == user.id)).all()
    )
    planned = [
        *plan_reminders(tasks, preferences, moment, existing),
        *plan_milestone_reminders(milestones, preferences, moment, existing),
    ]
    by_id = {task.id: task for task in tasks}
    created = []
    for item in planned:
        task = by_id.get(item.task_id) if item.task_id else None
        if task is not None:
            context = _task_context(task)
        elif item.milestone_id is not None:
            project = db.get(Project, item.project_id) if item.project_id else None
            context = {
                "task_id": None,
                "workspace_id": project.workspace_id if project else None,
                "project_id": item.project_id,
                "entity_type": "milestone",
                "entity_id": item.milestone_id,
                "link": project_link(item.project_id) if item.project_id else "/workspaces",
            }
        else:
            context = {"task_id": None, "entity_type": "reminder", "link": "/tasks"}
        notice = _insert(
            db,
            user_id=user.id,
            type=item.type,
            title=item.title,
            message=item.message,
            idempotency_key=item.idempotency_key,
            event_type=f"reminder.{item.type}",
            **context,
        )
        if notice is not None:
            created.append(notice)
            existing.add(item.idempotency_key)
    return created


def record_test(db: Session, user_id: int, now: datetime) -> Notification | None:
    return _insert(
        db,
        user_id=user_id,
        type="test",
        title="Test notification",
        message="Push delivery is working for this device.",
        idempotency_key=f"test:{now.strftime('%Y-%m-%dT%H:%M')}",
        event_type="notification.test",
        entity_type="notification",
        link="/notifications",
    )


def wants_push(notice: Notification) -> bool:
    """Push reminders and things other people did, never echoes of your own actions."""
    if notice.type in REMINDER_TYPES or notice.type == "test":
        return True
    return notice.actor_user_id is not None and notice.actor_user_id != notice.user_id


def _enqueue_deliveries(db: Session, notice: Notification) -> None:
    if not wants_push(notice):
        return
    user = db.get(User, notice.user_id)
    if user is None or not _flag(user.push_enabled):
        return
    devices = db.scalars(
        select(DevicePushToken).where(DevicePushToken.user_id == notice.user_id, DevicePushToken.disabled_at.is_(None))
    ).all()
    if not devices:
        return
    now = datetime.utcnow()
    when = quiet_hours_end(user, now) or now
    for device in devices:
        db.add(NotificationDelivery(
            notification_id=notice.id,
            user_id=notice.user_id,
            device_token_id=device.id,
            channel=device.provider,
            status="pending",
            attempts=0,
            next_attempt_at=when,
            created_at=now,
        ))


def _insert(db: Session, **fields) -> Notification | None:
    fields.setdefault("task_id", None)
    notice = Notification(created_at=datetime.utcnow(), **fields)
    db.add(notice)
    try:
        db.flush()
        event_service.emit(
            db,
            "notification.created",
            entity_type="notification",
            entity_id=notice.id,
            actor_id=notice.actor_user_id,
            user_id=notice.user_id,
            data={"notification_id": notice.id, "type": notice.type},
        )
        _enqueue_deliveries(db, notice)
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    db.refresh(notice)
    return notice
