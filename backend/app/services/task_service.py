from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Task, User
from app.services import collaboration_service, event_service, notification_service
from app.services.collaboration_service import CollaborationError


LINK_FIELDS = ("workspace_id", "project_id", "assignee_id", "milestone_id")
TASK_FIELDS = (
    "title",
    "description",
    "status",
    "priority",
    "progress",
    "start_date",
    "due_date",
    "category",
    *LINK_FIELDS,
)


def list_tasks(db: Session, user_id: int) -> list[Task]:
    return list(db.query(Task).filter(Task.user_id == user_id, Task.project_id.is_(None)).all())


def get_task(db: Session, user_id: int, task_id: int) -> Task | None:
    task = db.get(Task, task_id)
    if task is None:
        return None
    if task.project_id is None:
        return task if task.user_id == user_id else None
    user = db.get(User, user_id)
    if user is None:
        return None
    try:
        collaboration_service.require_project(db, user, task.project_id)
    except CollaborationError:
        return None
    return task


def can_edit_task(db: Session, user_id: int, task: Task) -> bool:
    if task.project_id is None:
        return task.user_id == user_id
    user = db.get(User, user_id)
    if user is None:
        return False
    try:
        collaboration_service.require_project(db, user, task.project_id, edit=True)
    except CollaborationError:
        return False
    return True


def create_task(db: Session, user_id: int, data: dict) -> Task:
    user = db.get(User, user_id)
    data = collaboration_service.validate_task_links(db, user, dict(data))
    task = Task(user_id=user_id, **data)
    db.add(task)
    db.flush()
    collaboration_service.record_task_activity(db, user, task, "task_created")
    event_service.emit_task(db, "task.created", task, user_id)
    assigned = None
    if task.assignee_id:
        assignee = db.get(User, task.assignee_id)
        collaboration_service.record_task_activity(
            db, user, task, "task_assigned", {"assignee": assignee.name if assignee else "someone"}
        )
        assigned = event_service.emit_task(db, "task.assigned", task, user_id, {"assignee_id": task.assignee_id})
    db.commit()
    db.refresh(task)
    notification_service.record_created(db, task, user_id)
    if assigned is not None:
        notification_service.notify_assignment(db, task, assigned)
    return task


def update_task(db: Session, task: Task, data: dict, actor_id: int | None = None) -> Task:
    actor_id = actor_id or task.user_id
    if not can_edit_task(db, actor_id, task):
        raise CollaborationError(403, "You cannot edit this task")
    user = db.get(User, actor_id)
    if any(field in data for field in LINK_FIELDS):
        data = collaboration_service.validate_task_links(db, user, data, existing=task)
    previous_status = task.status
    previous_assignee = task.assignee_id
    previous_project = task.project_id
    previous_workspace = task.workspace_id
    changed = sorted(field for field in TASK_FIELDS if field in data and getattr(task, field) != data[field])
    for field in TASK_FIELDS:
        if field in data:
            setattr(task, field, data[field].strip() if field == "title" and data[field] else data[field])
    event = _task_event(previous_status, previous_assignee, task)
    extra = None
    if event == "task_assigned":
        assignee = db.get(User, task.assignee_id) if task.assignee_id else None
        extra = {"assignee": assignee.name if assignee else "Unassigned"}
    collaboration_service.record_task_activity(db, user, task, event, extra)
    if previous_status != "completed" and task.status == "completed":
        public_type = "task.completed"
    elif previous_status == "completed" and task.status != "completed":
        public_type = "task.reopened"
    else:
        public_type = "task.updated"
    published = event_service.emit_task(
        db,
        public_type,
        task,
        actor_id,
        {"changed": changed},
        previous_project_id=previous_project,
        previous_workspace_id=previous_workspace,
    )
    assigned = None
    if task.assignee_id and task.assignee_id != previous_assignee:
        assigned = event_service.emit_task(db, "task.assigned", task, actor_id, {"assignee_id": task.assignee_id})
    db.commit()
    db.refresh(task)
    if public_type == "task.completed":
        notification_service.record_completion(db, task, actor_id)
        notification_service.notify_task_collaborators(db, task, published, "completed", "completed")
    elif public_type == "task.reopened":
        notification_service.record_reopened(db, task, actor_id)
        notification_service.notify_task_collaborators(db, task, published, "reopened", "reopened")
    else:
        notification_service.record_updated(db, task, actor_id)
        if assigned is None:
            notification_service.notify_task_collaborators(db, task, published, "updated", "updated")
    if assigned is not None:
        notification_service.notify_assignment(db, task, assigned)
    return task


def _task_event(previous_status: str, previous_assignee: int | None, task: Task) -> str:
    if previous_status != "completed" and task.status == "completed":
        return "task_completed"
    if previous_status == "completed" and task.status != "completed":
        return "task_reopened"
    if previous_status != task.status:
        return "task_status_changed"
    if previous_assignee != task.assignee_id:
        return "task_assigned"
    return "task_updated"


def delete_task(db: Session, task: Task, actor_id: int | None = None) -> None:
    actor_id = actor_id or task.user_id
    notification_service.record_deleted(db, task, actor_id)
    published = event_service.emit_task(db, "task.deleted", task, actor_id)
    assignee_id = task.assignee_id
    db.commit()
    if assignee_id and assignee_id != task.user_id:
        notification_service.notify_task_collaborators(db, task, published, "deleted", "deleted")
    for user_id in {task.user_id, assignee_id} - {None}:
        notification_service.detach_task(db, user_id, task.id)
    db.delete(task)
    db.commit()


def get_task_stats(db: Session, user_id: int) -> dict[str, int]:
    """Return aggregate task counts for the dashboard."""
    counts = db.execute(
        select(
            func.count(Task.id).label("total_tasks"),
            func.coalesce(func.sum(case((Task.status == "pending", 1), else_=0)), 0).label(
                "pending_count"
            ),
            func.coalesce(
                func.sum(case((Task.status == "in-progress", 1), else_=0)), 0
            ).label("in_progress_count"),
            func.coalesce(func.sum(case((Task.status == "completed", 1), else_=0)), 0).label(
                "completed_count"
            ),
            func.coalesce(func.sum(case((Task.priority == "high", 1), else_=0)), 0).label(
                "high_priority_count"
            ),
            func.coalesce(func.sum(case((Task.priority == "medium", 1), else_=0)), 0).label(
                "medium_priority_count"
            ),
            func.coalesce(func.sum(case((Task.priority == "low", 1), else_=0)), 0).label(
                "low_priority_count"
            ),
        ).where(Task.user_id == user_id, Task.project_id.is_(None))
    ).mappings().one()
    return dict(counts)
