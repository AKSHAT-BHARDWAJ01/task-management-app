from sqlalchemy.orm import Session

from app.models import Task


def list_tasks(db: Session) -> list[Task]:
    return list(db.query(Task).all())


def get_task(db: Session, task_id: int) -> Task | None:
    return db.get(Task, task_id)


def create_task(db: Session, data: dict) -> Task:
    task = Task(
        title=data["title"].strip(),
        description=data.get("description", ""),
        status=data.get("status", "pending"),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, task: Task, data: dict) -> Task:
    for field in ("title", "description", "status"):
        if field in data:
            setattr(task, field, data[field].strip() if field == "title" else data[field])
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task: Task) -> None:
    db.delete(task)
    db.commit()
