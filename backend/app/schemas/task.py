from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


TaskStatus = Literal["pending", "in-progress", "completed"]
TaskPriority = Literal["low", "medium", "high"]


class TaskCreate(BaseModel):
    title: str = Field(max_length=200)
    description: str = Field(default="", max_length=500)
    status: TaskStatus = "pending"
    priority: TaskPriority = "medium"
    progress: int = Field(default=0, ge=0, le=100)
    start_date: datetime | None = None
    due_date: datetime | None = None
    category: str | None = Field(default=None, max_length=100)

    @field_validator("title")
    @classmethod
    def title_must_not_be_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Title cannot be empty")
        return value


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    start_date: datetime | None = None
    due_date: datetime | None = None
    category: str | None = Field(default=None, max_length=100)

    @field_validator("title")
    @classmethod
    def title_must_not_be_empty(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Title cannot be empty")
        return value


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    user_id: int
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    progress: int
    start_date: datetime | None = Field(serialization_alias="startDate")
    due_date: datetime | None = Field(serialization_alias="dueDate")
    category: str | None
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")


class TaskStats(BaseModel):
    total_tasks: int
    pending_count: int
    in_progress_count: int
    completed_count: int
    high_priority_count: int
    medium_priority_count: int
    low_priority_count: int
