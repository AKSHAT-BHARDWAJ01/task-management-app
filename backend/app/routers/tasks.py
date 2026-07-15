from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas.task import TaskCreate, TaskRead, TaskStats, TaskUpdate
from app.services.auth_service import get_current_user
from app.services import task_service


tasks_router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


@tasks_router.get("", response_model=list[TaskRead])
def get_tasks(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return task_service.list_tasks(db, current_user.id)


@tasks_router.get("/stats", response_model=TaskStats)
def get_task_stats(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return task_service.get_task_stats(db, current_user.id)


@tasks_router.get("/{task_id}", response_model=TaskRead)
def get_task(
    task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    task = task_service.get_task(db, current_user.id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@tasks_router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return task_service.create_task(db, current_user.id, payload.model_dump())


@tasks_router.put("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = task_service.get_task(db, current_user.id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_service.update_task(db, task, payload.model_dump(exclude_unset=True))


@tasks_router.delete("/{task_id}")
def delete_task(
    task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    task = task_service.get_task(db, current_user.id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    task_service.delete_task(db, task)
    return {"message": "Task deleted successfully"}
