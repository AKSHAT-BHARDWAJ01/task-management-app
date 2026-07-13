from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Task


def list_tasks(db: Session) -> list[Task]:
    return list(db.query(Task).all())


def get_task(db: Session, task_id: int) -> Task | None:
    return db.get(Task, task_id)


def create_task(db: Session, data: dict) -> Task:
    task = Task(**data)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, task: Task, data: dict) -> Task:
    for field in (
        "title",
        "description",
        "status",
        "priority",
        "progress",
        "start_date",
        "due_date",
        "category",
    ):
        if field in data:
            setattr(task, field, data[field].strip() if field == "title" else data[field])
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task: Task) -> None:
    db.delete(task)
    db.commit()


def get_task_stats(db: Session) -> dict[str, int]:
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
        )
    ).mappings().one()
    return dict(counts)
