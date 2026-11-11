"""Workspaces, projects, invitations, milestones, and activity."""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Milestone,
    Project,
    ProjectActivity,
    ProjectMembership,
    Task,
    User,
    Workspace,
    WorkspaceInvitation,
    WorkspaceMembership,
)

INVITE_DAYS = 7
WORKSPACE_ROLES = {"owner", "admin", "member"}
PROJECT_ROLES = {"lead", "editor", "viewer"}
PROJECT_STATUSES = {"planning", "active", "on_hold", "completed", "cancelled"}
HEALTH_VALUES = {"on_track", "at_risk", "off_track"}


class CollaborationError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _slug(value: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return (base or "item")[:80]


def _unique_workspace_slug(db: Session, name: str) -> str:
    base = _slug(name)
    slug = base
    index = 2
    while db.scalar(select(Workspace.id).where(Workspace.slug == slug)):
        slug = f"{base}-{index}"
        index += 1
    return slug


def _unique_project_slug(db: Session, workspace_id: int, name: str) -> str:
    base = _slug(name)
    slug = base
    index = 2
    while db.scalar(
        select(Project.id).where(Project.workspace_id == workspace_id, Project.slug == slug)
    ):
        slug = f"{base}-{index}"
        index += 1
    return slug


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def membership(db: Session, workspace_id: int, user_id: int) -> WorkspaceMembership | None:
    return db.scalar(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.user_id == user_id,
        )
    )


def require_workspace_member(db: Session, workspace_id: int, user: User) -> tuple[Workspace, WorkspaceMembership]:
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        raise CollaborationError(404, "Workspace not found")
    row = membership(db, workspace_id, user.id)
    if row is None:
        raise CollaborationError(404, "Workspace not found")
    return workspace, row


def _require_role(row: WorkspaceMembership, allowed: set[str]) -> None:
    if row.role not in allowed:
        raise CollaborationError(403, "You do not have permission to do that")


def can_grant(actor_role: str, intended_role: str) -> bool:
    if intended_role not in {"admin", "member"}:
        return False
    if actor_role == "owner":
        return True
    return actor_role == "admin" and intended_role == "member"


def project_membership(db: Session, project_id: int, user_id: int) -> ProjectMembership | None:
    return db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
    )


def can_view_project(db: Session, user_id: int, project: Project, workspace_role: str) -> bool:
    if workspace_role in {"owner", "admin"}:
        return True
    if project.visibility == "workspace":
        return True
    return project_membership(db, project.id, user_id) is not None


def can_edit_project(db: Session, user_id: int, project: Project, workspace_role: str) -> bool:
    if workspace_role in {"owner", "admin"}:
        return True
    row = project_membership(db, project.id, user_id)
    return row is not None and row.role in {"lead", "editor"}


def require_project(db: Session, user: User, project_id: int, *, edit: bool = False) -> tuple[Project, WorkspaceMembership]:
    project = db.get(Project, project_id)
    if project is None:
        raise CollaborationError(404, "Project not found")
    workspace, row = require_workspace_member(db, project.workspace_id, user)
    allowed = can_edit_project(db, user.id, project, row.role) if edit else can_view_project(db, user.id, project, row.role)
    if not allowed:
        raise CollaborationError(404, "Project not found")
    return project, row


def record_activity(
    db: Session,
    *,
    workspace_id: int,
    actor_id: int,
    event_type: str,
    entity_type: str,
    entity_id: int | None,
    project_id: int | None = None,
    metadata: dict | None = None,
) -> None:
    db.add(
        ProjectActivity(
            workspace_id=workspace_id,
            project_id=project_id,
            actor_user_id=actor_id,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=json.dumps(metadata or {}),
            created_at=_now(),
        )
    )


def user_brief(user: User | None) -> dict | None:
    if user is None:
        return None
    return {"id": user.id, "name": user.name, "email": user.email}


def ensure_personal_workspace(db: Session, user: User) -> Workspace:
    existing = db.scalar(
        select(Workspace)
        .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
        .where(WorkspaceMembership.user_id == user.id, Workspace.workspace_type == "personal")
    )
    if existing is not None:
        return existing
    first = user.name.split()[0] if user.name else "My"
    workspace = Workspace(
        name=f"{first}'s Personal Workspace",
        slug=_unique_workspace_slug(db, f"{first}-personal"),
        description="Personal tasks and projects.",
        owner_id=user.id,
        workspace_type="personal",
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(workspace)
    db.flush()
    db.add(
        WorkspaceMembership(
            workspace_id=workspace.id,
            user_id=user.id,
            role="owner",
            joined_at=_now(),
        )
    )
    db.commit()
    db.refresh(workspace)
    return workspace


def list_workspaces(db: Session, user: User) -> list[dict]:
    ensure_personal_workspace(db, user)
    rows = db.execute(
        select(Workspace, WorkspaceMembership.role)
        .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
        .where(WorkspaceMembership.user_id == user.id)
        .order_by(Workspace.workspace_type.desc(), Workspace.name)
    ).all()
    return [_workspace_payload(db, workspace, role) for workspace, role in rows]


def _workspace_payload(db: Session, workspace: Workspace, role: str) -> dict:
    member_count = db.scalar(
        select(func.count()).select_from(WorkspaceMembership).where(WorkspaceMembership.workspace_id == workspace.id)
    ) or 0
    return {
        "id": workspace.id,
        "name": workspace.name,
        "slug": workspace.slug,
        "description": workspace.description,
        "owner_id": workspace.owner_id,
        "workspace_type": workspace.workspace_type,
        "role": role,
        "member_count": member_count,
        "created_at": workspace.created_at,
        "updated_at": workspace.updated_at,
    }


def create_team_workspace(db: Session, user: User, name: str, description: str | None) -> dict:
    name = name.strip()
    if not name:
        raise CollaborationError(422, "Workspace name is required")
    workspace = Workspace(
        name=name,
        slug=_unique_workspace_slug(db, name),
        description=(description or "").strip() or None,
        owner_id=user.id,
        workspace_type="team",
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(workspace)
    db.flush()
    db.add(WorkspaceMembership(workspace_id=workspace.id, user_id=user.id, role="owner", joined_at=_now()))
    db.commit()
    db.refresh(workspace)
    return _workspace_payload(db, workspace, "owner")


def update_workspace(db: Session, user: User, workspace_id: int, data: dict) -> dict:
    workspace, row = require_workspace_member(db, workspace_id, user)
    _require_role(row, {"owner", "admin"})
    if "name" in data and data["name"]:
        workspace.name = data["name"].strip()
    if "description" in data:
        workspace.description = (data["description"] or "").strip() or None
    workspace.updated_at = _now()
    db.commit()
    db.refresh(workspace)
    return _workspace_payload(db, workspace, row.role)


def delete_workspace(db: Session, user: User, workspace_id: int) -> None:
    workspace, row = require_workspace_member(db, workspace_id, user)
    _require_role(row, {"owner"})
    if workspace.workspace_type == "personal":
        raise CollaborationError(403, "The personal workspace cannot be deleted")
    db.query(Task).filter(Task.workspace_id == workspace.id).update(
        {Task.project_id: None, Task.workspace_id: None, Task.milestone_id: None},
        synchronize_session=False,
    )
    for model in (ProjectActivity, WorkspaceInvitation, WorkspaceMembership):
        db.query(model).filter(model.workspace_id == workspace.id).delete(synchronize_session=False)
    project_ids = [row_id for (row_id,) in db.query(Project.id).filter(Project.workspace_id == workspace.id).all()]
    if project_ids:
        db.query(ProjectMembership).filter(ProjectMembership.project_id.in_(project_ids)).delete(synchronize_session=False)
        db.query(Milestone).filter(Milestone.project_id.in_(project_ids)).delete(synchronize_session=False)
        db.query(Project).filter(Project.id.in_(project_ids)).delete(synchronize_session=False)
    db.delete(workspace)
    db.commit()


def transfer_ownership(db: Session, user: User, workspace_id: int, new_owner_id: int) -> dict:
    workspace, row = require_workspace_member(db, workspace_id, user)
    _require_role(row, {"owner"})
    if workspace.workspace_type == "personal":
        raise CollaborationError(403, "Personal workspace ownership cannot be transferred")
    target = membership(db, workspace_id, new_owner_id)
    if target is None:
        raise CollaborationError(404, "That person is not a member of this workspace")
    target.role = "owner"
    row.role = "admin"
    workspace.owner_id = new_owner_id
    workspace.updated_at = _now()
    db.commit()
    return _workspace_payload(db, workspace, "admin")


def list_members(db: Session, user: User, workspace_id: int) -> list[dict]:
    require_workspace_member(db, workspace_id, user)
    rows = db.execute(
        select(WorkspaceMembership, User)
        .join(User, User.id == WorkspaceMembership.user_id)
        .where(WorkspaceMembership.workspace_id == workspace_id)
        .order_by(WorkspaceMembership.joined_at)
    ).all()
    return [
        {
            "id": member.id,
            "user_id": person.id,
            "name": person.name,
            "email": person.email,
            "role": member.role,
            "joined_at": member.joined_at,
            "status": "active",
        }
        for member, person in rows
    ]


def change_member_role(db: Session, user: User, workspace_id: int, member_user_id: int, role: str) -> dict:
    workspace, actor = require_workspace_member(db, workspace_id, user)
    if role not in {"admin", "member"}:
        raise CollaborationError(422, "Choose admin or member")
    if not can_grant(actor.role, role):
        raise CollaborationError(403, "You cannot grant that role")
    target = membership(db, workspace_id, member_user_id)
    if target is None:
        raise CollaborationError(404, "Member not found")
    if target.role == "owner" or target.user_id == workspace.owner_id:
        raise CollaborationError(403, "Transfer ownership before changing the owner's role")
    if actor.role == "admin" and target.role != "member":
        raise CollaborationError(403, "Admins can only manage members")
    target.role = role
    db.commit()
    return {"user_id": target.user_id, "role": target.role}


def remove_member(db: Session, user: User, workspace_id: int, member_user_id: int) -> None:
    workspace, actor = require_workspace_member(db, workspace_id, user)
    target = membership(db, workspace_id, member_user_id)
    if target is None:
        raise CollaborationError(404, "Member not found")
    if target.role == "owner" or member_user_id == workspace.owner_id:
        raise CollaborationError(403, "The workspace owner cannot be removed")
    owners = db.scalar(
        select(func.count()).select_from(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.role == "owner",
        )
    ) or 0
    if target.role == "owner" and owners <= 1:
        raise CollaborationError(403, "A workspace must keep one owner")
    if actor.role == "member" or (actor.role == "admin" and target.role != "member"):
        raise CollaborationError(403, "You do not have permission to remove that member")
    if actor.role not in {"owner", "admin"}:
        raise CollaborationError(403, "You do not have permission to remove that member")
    db.delete(target)
    project_ids = [item_id for (item_id,) in db.query(Project.id).filter(Project.workspace_id == workspace_id).all()]
    if project_ids:
        db.query(ProjectMembership).filter(
            ProjectMembership.project_id.in_(project_ids),
            ProjectMembership.user_id == member_user_id,
        ).delete(synchronize_session=False)
    db.commit()


def _active_invite(db: Session, workspace_id: int, email: str) -> WorkspaceInvitation | None:
    now = _now()
    return db.scalar(
        select(WorkspaceInvitation).where(
            WorkspaceInvitation.workspace_id == workspace_id,
            WorkspaceInvitation.invited_email == email,
            WorkspaceInvitation.accepted_at.is_(None),
            WorkspaceInvitation.revoked_at.is_(None),
            WorkspaceInvitation.expires_at > now,
        )
    )


def create_invitation(db: Session, user: User, workspace_id: int, email: str, role: str) -> dict:
    workspace, actor = require_workspace_member(db, workspace_id, user)
    email = email.strip().lower()
    if "@" not in email:
        raise CollaborationError(422, "Enter a valid email address")
    if not can_grant(actor.role, role):
        raise CollaborationError(403, "You cannot invite someone with that role")
    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user and membership(db, workspace_id, existing_user.id):
        raise CollaborationError(409, "That person is already a member")
    if _active_invite(db, workspace_id, email):
        raise CollaborationError(409, "An active invitation already exists for that email")
    token = secrets.token_urlsafe(32)
    invite = WorkspaceInvitation(
        workspace_id=workspace_id,
        invited_email=email,
        invited_by=user.id,
        intended_role=role,
        token_hash=hash_token(token),
        expires_at=_now() + timedelta(days=INVITE_DAYS),
        created_at=_now(),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return {**_invite_payload(db, invite), "token": token, "delivery": "link"}


def list_invitations(db: Session, user: User, workspace_id: int) -> list[dict]:
    _, actor = require_workspace_member(db, workspace_id, user)
    _require_role(actor, {"owner", "admin"})
    rows = db.scalars(
        select(WorkspaceInvitation)
        .where(WorkspaceInvitation.workspace_id == workspace_id)
        .order_by(WorkspaceInvitation.created_at.desc())
    ).all()
    return [_invite_payload(db, row) for row in rows]


def _invite_payload(db: Session, invite: WorkspaceInvitation) -> dict:
    inviter = db.get(User, invite.invited_by)
    now = _now()
    if invite.revoked_at:
        state = "revoked"
    elif invite.accepted_at:
        state = "accepted"
    elif invite.expires_at <= now:
        state = "expired"
    else:
        state = "pending"
    return {
        "id": invite.id,
        "workspace_id": invite.workspace_id,
        "invited_email": invite.invited_email,
        "intended_role": invite.intended_role,
        "expires_at": invite.expires_at,
        "accepted_at": invite.accepted_at,
        "revoked_at": invite.revoked_at,
        "created_at": invite.created_at,
        "status": state,
        "invited_by": user_brief(inviter),
    }


def revoke_invitation(db: Session, user: User, workspace_id: int, invitation_id: int) -> dict:
    _, actor = require_workspace_member(db, workspace_id, user)
    _require_role(actor, {"owner", "admin"})
    invite = db.get(WorkspaceInvitation, invitation_id)
    if invite is None or invite.workspace_id != workspace_id:
        raise CollaborationError(404, "Invitation not found")
    if invite.accepted_at:
        raise CollaborationError(409, "That invitation was already accepted")
    invite.revoked_at = _now()
    db.commit()
    return _invite_payload(db, invite)


def resend_invitation(db: Session, user: User, workspace_id: int, invitation_id: int) -> dict:
    revoke_invitation(db, user, workspace_id, invitation_id)
    old = db.get(WorkspaceInvitation, invitation_id)
    return create_invitation(db, user, workspace_id, old.invited_email, old.intended_role)


def _invite_by_token(db: Session, token: str) -> WorkspaceInvitation:
    invite = db.scalar(select(WorkspaceInvitation).where(WorkspaceInvitation.token_hash == hash_token(token)))
    if invite is None:
        raise CollaborationError(404, "This invitation link is invalid")
    if invite.revoked_at:
        raise CollaborationError(410, "This invitation was revoked")
    if invite.accepted_at:
        raise CollaborationError(409, "This invitation has already been used")
    if invite.expires_at <= _now():
        raise CollaborationError(410, "This invitation has expired")
    return invite


def preview_invitation(db: Session, token: str) -> dict:
    invite = _invite_by_token(db, token)
    workspace = db.get(Workspace, invite.workspace_id)
    inviter = db.get(User, invite.invited_by)
    return {
        "workspace_name": workspace.name if workspace else "Workspace",
        "workspace_type": workspace.workspace_type if workspace else "team",
        "invited_email": invite.invited_email,
        "intended_role": invite.intended_role,
        "expires_at": invite.expires_at,
        "invited_by": user_brief(inviter),
    }


def accept_invitation(db: Session, user: User, token: str) -> dict:
    invite = _invite_by_token(db, token)
    if user.email.lower() != invite.invited_email.lower():
        raise CollaborationError(403, "Sign in with the invited email address to accept")
    if membership(db, invite.workspace_id, user.id):
        invite.accepted_at = _now()
        db.commit()
        return {"workspace_id": invite.workspace_id, "already_member": True}
    db.add(
        WorkspaceMembership(
            workspace_id=invite.workspace_id,
            user_id=user.id,
            role=invite.intended_role if invite.intended_role in {"admin", "member"} else "member",
            invited_by=invite.invited_by,
            joined_at=_now(),
        )
    )
    invite.accepted_at = _now()
    db.commit()
    return {"workspace_id": invite.workspace_id, "already_member": False}


def decline_invitation(db: Session, user: User, token: str) -> None:
    invite = _invite_by_token(db, token)
    if user.email.lower() != invite.invited_email.lower():
        raise CollaborationError(403, "Sign in with the invited email address to decline")
    invite.revoked_at = _now()
    db.commit()


def _parse_date(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value)[:10])


def _project_progress(db: Session, project_id: int) -> dict:
    tasks = db.scalars(select(Task).where(Task.project_id == project_id)).all()
    eligible = [task for task in tasks if task.status != "cancelled"]
    completed = sum(1 for task in eligible if task.status == "completed")
    in_progress = sum(1 for task in eligible if task.status == "in-progress")
    pending = sum(1 for task in eligible if task.status == "pending")
    today = _now().date()
    overdue = sum(
        1
        for task in eligible
        if task.status != "completed" and task.due_date is not None and task.due_date.date() < today
    )
    total = len(eligible)
    percent = round((completed / total) * 100) if total else 0
    by_priority = {name: sum(1 for task in eligible if task.priority == name) for name in ("low", "medium", "high")}
    by_assignee: dict[str, int] = {}
    for task in eligible:
        key = str(task.assignee_id or "unassigned")
        by_assignee[key] = by_assignee.get(key, 0) + 1
    return {
        "total_tasks": total,
        "completed_tasks": completed,
        "in_progress_tasks": in_progress,
        "pending_tasks": pending,
        "overdue_tasks": overdue,
        "completion_percent": percent,
        "by_priority": by_priority,
        "by_assignee": by_assignee,
    }


def _project_payload(db: Session, project: Project, user_id: int) -> dict:
    lead = db.get(User, project.lead_user_id) if project.lead_user_id else None
    members = db.execute(
        select(ProjectMembership, User)
        .join(User, User.id == ProjectMembership.user_id)
        .where(ProjectMembership.project_id == project.id)
    ).all()
    progress = _project_progress(db, project.id)
    return {
        "id": project.id,
        "workspace_id": project.workspace_id,
        "name": project.name,
        "slug": project.slug,
        "description": project.description,
        "lead": user_brief(lead),
        "created_by": project.created_by,
        "status": project.status,
        "health": project.health,
        "priority": project.priority,
        "visibility": project.visibility,
        "start_date": project.start_date,
        "target_date": project.target_date,
        "icon": project.icon,
        "colour": project.colour,
        "archived_at": project.archived_at,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "members": [
            {"user_id": person.id, "name": person.name, "email": person.email, "role": member.role}
            for member, person in members
        ],
        **progress,
    }


def list_projects(db: Session, user: User, workspace_id: int, filters: dict) -> list[dict]:
    _, row = require_workspace_member(db, workspace_id, user)
    projects = db.scalars(select(Project).where(Project.workspace_id == workspace_id)).all()
    include_archived = bool(filters.get("archived"))
    search = (filters.get("search") or "").strip().lower()
    visible = []
    for project in projects:
        if not can_view_project(db, user.id, project, row.role):
            continue
        if project.archived_at and not include_archived:
            continue
        if not project.archived_at and include_archived:
            continue
        if filters.get("status") and project.status != filters["status"]:
            continue
        if filters.get("health") and project.health != filters["health"]:
            continue
        if filters.get("lead_user_id") and project.lead_user_id != int(filters["lead_user_id"]):
            continue
        target_after = _parse_date(filters.get("target_after")) if filters.get("target_after") else None
        target_before = _parse_date(filters.get("target_before")) if filters.get("target_before") else None
        if target_after and (project.target_date is None or project.target_date < target_after):
            continue
        if target_before and (project.target_date is None or project.target_date > target_before):
            continue
        if search and search not in project.name.lower() and search not in (project.description or "").lower():
            continue
        visible.append(project)
    sort = filters.get("sort") or "name"
    if sort == "target_date":
        visible.sort(key=lambda item: item.target_date or datetime.max)
    elif sort == "updated":
        visible.sort(key=lambda item: item.updated_at or datetime.min, reverse=True)
    else:
        visible.sort(key=lambda item: item.name.lower())
    return [_project_payload(db, project, user.id) for project in visible]


def create_project(db: Session, user: User, workspace_id: int, data: dict) -> dict:
    workspace, row = require_workspace_member(db, workspace_id, user)
    name = (data.get("name") or "").strip()
    if not name:
        raise CollaborationError(422, "Project name is required")
    lead_id = data.get("lead_user_id") or user.id
    if not membership(db, workspace_id, lead_id):
        raise CollaborationError(422, "The project lead must belong to this workspace")
    project = Project(
        workspace_id=workspace.id,
        name=name,
        slug=_unique_project_slug(db, workspace.id, name),
        description=(data.get("description") or "").strip() or None,
        lead_user_id=lead_id,
        created_by=user.id,
        status=data.get("status") if data.get("status") in PROJECT_STATUSES else "planning",
        health=data.get("health") if data.get("health") in HEALTH_VALUES else "on_track",
        priority=data.get("priority") if data.get("priority") in {"low", "medium", "high"} else "medium",
        visibility="private" if data.get("visibility") == "private" else "workspace",
        start_date=_parse_date(data.get("start_date")),
        target_date=_parse_date(data.get("target_date")),
        icon=(data.get("icon") or "")[:8] or None,
        colour=(data.get("colour") or "")[:20] or None,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=lead_id, role="lead", added_by=user.id, created_at=_now()))
    if lead_id != user.id:
        db.add(ProjectMembership(project_id=project.id, user_id=user.id, role="editor", added_by=user.id, created_at=_now()))
    record_activity(
        db,
        workspace_id=workspace.id,
        project_id=project.id,
        actor_id=user.id,
        event_type="project_created",
        entity_type="project",
        entity_id=project.id,
        metadata={"name": project.name},
    )
    db.commit()
    db.refresh(project)
    return _project_payload(db, project, user.id)


def get_project(db: Session, user: User, project_id: int) -> dict:
    project, _row = require_project(db, user, project_id)
    return _project_payload(db, project, user.id)


def update_project(db: Session, user: User, project_id: int, data: dict) -> dict:
    project, row = require_project(db, user, project_id, edit=True)
    if "health" in data and data["health"] not in HEALTH_VALUES:
        raise CollaborationError(422, "Choose a project health value")
    if "health" in data and row.role == "member" and project.lead_user_id != user.id:
        raise CollaborationError(403, "Only the project lead or a workspace admin can set health")
    previous_lead = project.lead_user_id
    previous_status = project.status
    previous_health = project.health
    if "name" in data and data["name"]:
        project.name = data["name"].strip()
    if "description" in data:
        project.description = (data["description"] or "").strip() or None
    if data.get("status") in PROJECT_STATUSES:
        project.status = data["status"]
    if data.get("health") in HEALTH_VALUES:
        project.health = data["health"]
    if data.get("priority") in {"low", "medium", "high"}:
        project.priority = data["priority"]
    if data.get("visibility") in {"workspace", "private"}:
        project.visibility = data["visibility"]
    if "start_date" in data:
        project.start_date = _parse_date(data.get("start_date"))
    if "target_date" in data:
        project.target_date = _parse_date(data.get("target_date"))
    if "icon" in data:
        project.icon = (data.get("icon") or "")[:8] or None
    if "colour" in data:
        project.colour = (data.get("colour") or "")[:20] or None
    if "lead_user_id" in data and data["lead_user_id"]:
        if not membership(db, project.workspace_id, data["lead_user_id"]):
            raise CollaborationError(422, "The project lead must belong to this workspace")
        project.lead_user_id = data["lead_user_id"]
        _set_project_role(db, project.id, data["lead_user_id"], "lead", user.id)
    project.updated_at = _now()
    metadata = {"name": project.name}
    event = "project_updated"
    if previous_lead != project.lead_user_id:
        event = "project_lead_changed"
    elif previous_health != project.health:
        event = "project_health_changed"
        metadata["health"] = {"on_track": "On track", "at_risk": "At risk", "off_track": "Off track"}.get(project.health, project.health)
    elif previous_status != project.status:
        event = "project_status_changed"
        metadata["status"] = {
            "planning": "Planning",
            "active": "Active",
            "on_hold": "On hold",
            "completed": "Completed",
            "cancelled": "Cancelled",
        }.get(project.status, project.status)
    record_activity(
        db,
        workspace_id=project.workspace_id,
        project_id=project.id,
        actor_id=user.id,
        event_type=event,
        entity_type="project",
        entity_id=project.id,
        metadata=metadata,
    )
    db.commit()
    db.refresh(project)
    return _project_payload(db, project, user.id)


def archive_project(db: Session, user: User, project_id: int, restore: bool = False) -> dict:
    project, row = require_project(db, user, project_id, edit=True)
    if row.role == "member" and project.lead_user_id != user.id:
        raise CollaborationError(403, "Only the project lead or a workspace admin can archive this project")
    project.archived_at = None if restore else _now()
    project.updated_at = _now()
    record_activity(
        db,
        workspace_id=project.workspace_id,
        project_id=project.id,
        actor_id=user.id,
        event_type="project_restored" if restore else "project_archived",
        entity_type="project",
        entity_id=project.id,
        metadata={"name": project.name},
    )
    db.commit()
    return _project_payload(db, project, user.id)


def delete_project(db: Session, user: User, project_id: int) -> None:
    project, row = require_project(db, user, project_id, edit=True)
    if row.role not in {"owner", "admin"} and project.lead_user_id != user.id:
        raise CollaborationError(403, "You cannot delete this project")
    db.query(Task).filter(Task.project_id == project.id).update(
        {Task.project_id: None, Task.workspace_id: None, Task.milestone_id: None, Task.assignee_id: None},
        synchronize_session=False,
    )
    db.query(ProjectMembership).filter(ProjectMembership.project_id == project.id).delete(synchronize_session=False)
    db.query(Milestone).filter(Milestone.project_id == project.id).delete(synchronize_session=False)
    record_activity(
        db,
        workspace_id=project.workspace_id,
        project_id=None,
        actor_id=user.id,
        event_type="project_deleted",
        entity_type="project",
        entity_id=project.id,
        metadata={"name": project.name},
    )
    db.delete(project)
    db.commit()


def _set_project_role(db: Session, project_id: int, user_id: int, role: str, added_by: int) -> None:
    row = project_membership(db, project_id, user_id)
    if row is None:
        db.add(ProjectMembership(project_id=project_id, user_id=user_id, role=role, added_by=added_by, created_at=_now()))
    else:
        row.role = role


def add_project_member(db: Session, user: User, project_id: int, member_user_id: int, role: str) -> dict:
    project, _row = require_project(db, user, project_id, edit=True)
    if role not in PROJECT_ROLES:
        raise CollaborationError(422, "Choose lead, editor, or viewer")
    if not membership(db, project.workspace_id, member_user_id):
        raise CollaborationError(422, "Project members must belong to the workspace")
    if role == "lead":
        project.lead_user_id = member_user_id
    _set_project_role(db, project.id, member_user_id, role, user.id)
    person = db.get(User, member_user_id)
    record_activity(
        db,
        workspace_id=project.workspace_id,
        project_id=project.id,
        actor_id=user.id,
        event_type="project_member_added",
        entity_type="project_member",
        entity_id=member_user_id,
        metadata={"name": person.name if person else "Member", "role": role},
    )
    db.commit()
    return get_project(db, user, project.id)


def remove_project_member(db: Session, user: User, project_id: int, member_user_id: int) -> dict:
    project, _row = require_project(db, user, project_id, edit=True)
    row = project_membership(db, project.id, member_user_id)
    if row is None:
        raise CollaborationError(404, "Project member not found")
    if member_user_id == project.lead_user_id:
        raise CollaborationError(403, "Choose a new project lead before removing this person")
    db.delete(row)
    person = db.get(User, member_user_id)
    record_activity(
        db,
        workspace_id=project.workspace_id,
        project_id=project.id,
        actor_id=user.id,
        event_type="project_member_removed",
        entity_type="project_member",
        entity_id=member_user_id,
        metadata={"name": person.name if person else "Member"},
    )
    db.commit()
    return get_project(db, user, project.id)


def milestone_status(milestone: Milestone, today) -> str:
    if milestone.completed_at:
        return "completed"
    if milestone.target_date and milestone.target_date.date() < today:
        return "overdue"
    return "upcoming"


def _milestone_payload(db: Session, milestone: Milestone) -> dict:
    tasks = db.scalars(select(Task).where(Task.milestone_id == milestone.id)).all()
    total = len(tasks)
    completed = sum(1 for task in tasks if task.status == "completed")
    percent = round((completed / total) * 100) if total else 0
    status = milestone_status(milestone, _now().date())
    if status != "completed" and any(task.status == "in-progress" for task in tasks):
        status = "in_progress" if status != "overdue" else status
    return {
        "id": milestone.id,
        "project_id": milestone.project_id,
        "name": milestone.name,
        "description": milestone.description,
        "target_date": milestone.target_date,
        "completed_at": milestone.completed_at,
        "status": status,
        "task_count": total,
        "completed_task_count": completed,
        "completion_percent": percent,
        "created_at": milestone.created_at,
        "updated_at": milestone.updated_at,
    }


def list_milestones(db: Session, user: User, project_id: int) -> list[dict]:
    require_project(db, user, project_id)
    rows = db.scalars(select(Milestone).where(Milestone.project_id == project_id).order_by(Milestone.target_date)).all()
    return [_milestone_payload(db, row) for row in rows]


def create_milestone(db: Session, user: User, project_id: int, data: dict) -> dict:
    project, _row = require_project(db, user, project_id, edit=True)
    name = (data.get("name") or "").strip()
    if not name:
        raise CollaborationError(422, "Milestone name is required")
    milestone = Milestone(
        project_id=project.id,
        name=name,
        description=(data.get("description") or "").strip() or None,
        target_date=_parse_date(data.get("target_date")),
        created_by=user.id,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(milestone)
    db.flush()
    record_activity(
        db,
        workspace_id=project.workspace_id,
        project_id=project.id,
        actor_id=user.id,
        event_type="milestone_created",
        entity_type="milestone",
        entity_id=milestone.id,
        metadata={"name": milestone.name},
    )
    db.commit()
    db.refresh(milestone)
    return _milestone_payload(db, milestone)


def update_milestone(db: Session, user: User, project_id: int, milestone_id: int, data: dict) -> dict:
    project, _row = require_project(db, user, project_id, edit=True)
    milestone = db.get(Milestone, milestone_id)
    if milestone is None or milestone.project_id != project.id:
        raise CollaborationError(404, "Milestone not found")
    previous_target = milestone.target_date
    if "name" in data and data["name"]:
        milestone.name = data["name"].strip()
    if "description" in data:
        milestone.description = (data["description"] or "").strip() or None
    if "target_date" in data:
        milestone.target_date = _parse_date(data.get("target_date"))
    if data.get("completed") is True and milestone.completed_at is None:
        milestone.completed_at = _now()
    if data.get("completed") is False:
        milestone.completed_at = None
    milestone.updated_at = _now()
    event = "milestone_updated"
    if previous_target != milestone.target_date:
        event = "milestone_target_changed"
    if data.get("completed") is True:
        event = "milestone_completed"
    record_activity(
        db,
        workspace_id=project.workspace_id,
        project_id=project.id,
        actor_id=user.id,
        event_type=event,
        entity_type="milestone",
        entity_id=milestone.id,
        metadata={"name": milestone.name},
    )
    db.commit()
    return _milestone_payload(db, milestone)


def delete_milestone(db: Session, user: User, project_id: int, milestone_id: int) -> None:
    project, _row = require_project(db, user, project_id, edit=True)
    milestone = db.get(Milestone, milestone_id)
    if milestone is None or milestone.project_id != project.id:
        raise CollaborationError(404, "Milestone not found")
    db.query(Task).filter(Task.milestone_id == milestone.id).update({Task.milestone_id: None}, synchronize_session=False)
    db.delete(milestone)
    db.commit()


def _status_label(status: str | None) -> str:
    return {"pending": "To Do", "in-progress": "In Progress", "completed": "Done"}.get(status or "", status or "another column")


def describe_activity(event_type: str, metadata: dict, actor_name: str) -> str:
    name = metadata.get("name") or "an item"
    assignee = metadata.get("assignee")
    phrases = {
        "project_created": f"{actor_name} created the project {name}.",
        "project_updated": f"{actor_name} edited the details of {name}.",
        "project_health_changed": f"{actor_name} set the health of {name} to {metadata.get('health', 'a new level')}.",
        "project_status_changed": f"{actor_name} set the status of {name} to {metadata.get('status', 'a new status')}.",
        "project_archived": f"{actor_name} archived {name}.",
        "project_restored": f"{actor_name} restored {name}.",
        "project_deleted": f"{actor_name} deleted {name}.",
        "project_lead_changed": f"{actor_name} changed the lead for {name}.",
        "project_member_added": f"{actor_name} added {name} to the project as {metadata.get('role', 'a member')}.",
        "project_member_removed": f"{actor_name} removed {name} from the project.",
        "task_created": f"{actor_name} added the task {name}.",
        "task_updated": f"{actor_name} edited the details of {name}.",
        "task_status_changed": f"{actor_name} moved {name} to {_status_label(metadata.get('status'))}.",
        "task_assigned": f"{actor_name} assigned {name} to {assignee or 'someone'}.",
        "task_completed": f"{actor_name} completed {name}.",
        "task_reopened": f"{actor_name} reopened {name}.",
        "milestone_created": f"{actor_name} added the milestone {name}.",
        "milestone_completed": f"{name} was marked completed.",
        "milestone_target_changed": f"{actor_name} changed the target date for {name}.",
        "milestone_updated": f"{actor_name} updated {name}.",
    }
    return phrases.get(event_type, f"{actor_name} updated the project.")


def list_activity(db: Session, user: User, project_id: int, limit: int, offset: int) -> dict:
    require_project(db, user, project_id)
    query = select(ProjectActivity).where(ProjectActivity.project_id == project_id).order_by(ProjectActivity.created_at.desc())
    total = db.scalar(select(func.count()).select_from(ProjectActivity).where(ProjectActivity.project_id == project_id)) or 0
    rows = db.scalars(query.offset(offset).limit(limit)).all()
    items = []
    for row in rows:
        actor = db.get(User, row.actor_user_id)
        metadata = json.loads(row.metadata_json or "{}")
        items.append(
            {
                "id": row.id,
                "event_type": row.event_type,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "created_at": row.created_at,
                "actor": user_brief(actor),
                "description": describe_activity(row.event_type, metadata, actor.name if actor else "Someone"),
            }
        )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def list_project_tasks(db: Session, user: User, project_id: int) -> list[Task]:
    require_project(db, user, project_id)
    return list(db.scalars(select(Task).where(Task.project_id == project_id).order_by(Task.created_at.desc())).all())


def validate_task_links(db: Session, user: User, data: dict, *, existing: Task | None = None) -> dict:
    project_id = data["project_id"] if "project_id" in data else (existing.project_id if existing else None)
    if project_id is None:
        if data.get("assignee_id") or data.get("milestone_id") or data.get("workspace_id"):
            raise CollaborationError(422, "Assign a project before adding workspace details")
        data["workspace_id"] = None
        data["milestone_id"] = None
        data["assignee_id"] = None
        return data
    project, _row = require_project(db, user, project_id, edit=True)
    data["project_id"] = project.id
    data["workspace_id"] = project.workspace_id
    milestone_id = data["milestone_id"] if "milestone_id" in data else (existing.milestone_id if existing else None)
    if milestone_id:
        milestone = db.get(Milestone, milestone_id)
        if milestone is None or milestone.project_id != project.id:
            raise CollaborationError(422, "That milestone belongs to another project")
        data["milestone_id"] = milestone.id
    assignee_id = data["assignee_id"] if "assignee_id" in data else (existing.assignee_id if existing else None)
    if assignee_id:
        if not membership(db, project.workspace_id, assignee_id):
            raise CollaborationError(422, "The assignee must be a workspace member")
        if project.visibility == "private" and not can_view_project(
            db, assignee_id, project, membership(db, project.workspace_id, assignee_id).role
        ):
            raise CollaborationError(422, "The assignee cannot access this private project")
        data["assignee_id"] = assignee_id
    return data


def record_task_activity(db: Session, user: User, task: Task, event_type: str, extra: dict | None = None) -> None:
    if task.project_id is None:
        return
    metadata = {"name": task.title, "status": task.status}
    if extra:
        metadata.update(extra)
    record_activity(
        db,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        actor_id=user.id,
        event_type=event_type,
        entity_type="task",
        entity_id=task.id,
        metadata=metadata,
    )
