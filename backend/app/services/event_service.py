"""Versioned change events shared by the web and mobile clients.

Events are written in the same transaction as the change they describe, so a
client never hears about a change that was rolled back. Visibility is decided
when the feed is read, from the reader's current memberships, so someone who
lost access stops receiving events for that workspace or project at once.

The feed hands back a cursor a few seconds behind the newest event. Ids are
assigned at insert but transactions can commit out of order; holding the cursor
back means a slow commit is picked up on the next poll instead of being skipped.
Clients may therefore see an event twice and must treat them idempotently.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from app.models import DomainEvent, Project, ProjectMembership, Task, User, WorkspaceMembership

EVENT_VERSION = 1
SETTLE_SECONDS = 5
RETENTION_DAYS = 14

EVENT_TYPES = frozenset({
    "task.created",
    "task.updated",
    "task.completed",
    "task.reopened",
    "task.deleted",
    "task.assigned",
    "workspace.created",
    "workspace.updated",
    "workspace.deleted",
    "workspace.member_added",
    "workspace.member_removed",
    "workspace.role_changed",
    "invitation.created",
    "invitation.accepted",
    "invitation.declined",
    "invitation.revoked",
    "project.created",
    "project.updated",
    "project.archived",
    "project.restored",
    "project.deleted",
    "project.member_added",
    "project.member_removed",
    "milestone.created",
    "milestone.updated",
    "milestone.completed",
    "milestone.deleted",
    "notification.created",
    "notification.read",
    "notification.deleted",
    "preferences.updated",
})


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def emit(
    db: Session,
    event_type: str,
    *,
    entity_type: str,
    entity_id: int | None,
    actor_id: int | None = None,
    workspace_id: int | None = None,
    project_id: int | None = None,
    user_id: int | None = None,
    data: dict | None = None,
) -> DomainEvent:
    """Stage an event on the session. The caller's commit publishes it."""
    if event_type not in EVENT_TYPES:
        raise ValueError(f"Unknown event type: {event_type}")
    if user_id is None and workspace_id is None:
        raise ValueError("An event needs a workspace or a single recipient")
    row = DomainEvent(
        event_id=str(uuid.uuid4()),
        type=event_type,
        version=EVENT_VERSION,
        workspace_id=workspace_id,
        project_id=project_id,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_id,
        payload_json=json.dumps(data or {}, default=str),
        created_at=_now(),
    )
    db.add(row)
    return row


def emit_task(
    db: Session,
    event_type: str,
    task: Task,
    actor_id: int | None,
    data: dict | None = None,
    *,
    previous_project_id: int | None = None,
    previous_workspace_id: int | None = None,
) -> DomainEvent:
    payload = {"task_id": task.id, "status": task.status, **(data or {})}
    if task.project_id is None:
        event = emit(db, event_type, entity_type="task", entity_id=task.id, actor_id=actor_id, user_id=task.user_id, data=payload)
    else:
        event = emit(
            db,
            event_type,
            entity_type="task",
            entity_id=task.id,
            actor_id=actor_id,
            workspace_id=task.workspace_id,
            project_id=task.project_id,
            data=payload,
        )
    if previous_project_id and previous_project_id != task.project_id:
        emit(
            db,
            "task.updated",
            entity_type="task",
            entity_id=task.id,
            actor_id=actor_id,
            workspace_id=previous_workspace_id,
            project_id=previous_project_id,
            data={"task_id": task.id, "moved_out": True},
        )
    return event


def envelope(row: DomainEvent) -> dict:
    occurred = row.created_at.replace(tzinfo=timezone.utc).isoformat() if row.created_at else None
    return {
        "id": row.id,
        "event_id": row.event_id,
        "type": row.type,
        "version": row.version,
        "occurred_at": occurred,
        "workspace_id": row.workspace_id,
        "project_id": row.project_id,
        "entity": {"type": row.entity_type, "id": row.entity_id},
        "actor_id": row.actor_user_id,
        "data": json.loads(row.payload_json or "{}"),
    }


def visible_scope(db: Session, user: User) -> tuple[set[int], set[int]]:
    """Workspace ids the user belongs to and project ids they can see right now."""
    roles = dict(
        db.execute(
            select(WorkspaceMembership.workspace_id, WorkspaceMembership.role).where(WorkspaceMembership.user_id == user.id)
        ).all()
    )
    if not roles:
        return set(), set()
    mine = set(db.scalars(select(ProjectMembership.project_id).where(ProjectMembership.user_id == user.id)).all())
    projects = db.execute(
        select(Project.id, Project.workspace_id, Project.visibility).where(Project.workspace_id.in_(roles.keys()))
    ).all()
    visible = {
        project_id
        for project_id, workspace_id, visibility in projects
        if roles.get(workspace_id) in {"owner", "admin"} or visibility == "workspace" or project_id in mine
    }
    return set(roles.keys()), visible


def list_events(db: Session, user: User, after: int | None, limit: int = 100, now: datetime | None = None) -> dict:
    now = now or _now()
    settled = db.scalar(
        select(func.max(DomainEvent.id)).where(DomainEvent.created_at <= now - timedelta(seconds=SETTLE_SECONDS))
    ) or 0
    server_time = now.replace(tzinfo=timezone.utc).isoformat()
    if after is None:
        return {"events": [], "cursor": settled, "has_more": False, "reset": False, "server_time": server_time}

    oldest = db.scalar(select(func.min(DomainEvent.id)))
    latest = db.scalar(select(func.max(DomainEvent.id))) or 0
    if after > latest or (after > 0 and oldest is not None and after < oldest - 1):
        return {"events": [], "cursor": settled, "has_more": False, "reset": True, "server_time": server_time}

    workspace_ids, project_ids = visible_scope(db, user)
    audience = DomainEvent.user_id == user.id
    if workspace_ids:
        audience = or_(audience, and_(DomainEvent.user_id.is_(None), DomainEvent.workspace_id.in_(workspace_ids)))
    rows = list(
        db.scalars(
            select(DomainEvent).where(DomainEvent.id > after, audience).order_by(DomainEvent.id).limit(limit + 1)
        ).all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    events = [
        envelope(row)
        for row in rows
        if row.user_id is not None or row.project_id is None or row.project_id in project_ids
    ]
    if has_more:
        settled_rows = [row.id for row in rows if row.created_at <= now - timedelta(seconds=SETTLE_SECONDS)]
        cursor = settled_rows[-1] if settled_rows else after
    else:
        cursor = settled
    return {
        "events": events,
        "cursor": max(after, cursor),
        "has_more": has_more,
        "reset": False,
        "server_time": server_time,
    }


def prune(db: Session, now: datetime | None = None) -> int:
    cutoff = (now or _now()) - timedelta(days=RETENTION_DAYS)
    result = db.execute(delete(DomainEvent).where(DomainEvent.created_at < cutoff))
    db.commit()
    return result.rowcount or 0
