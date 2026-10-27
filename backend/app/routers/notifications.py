from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas.notification import (
    NotificationList,
    NotificationRead,
    ReminderPreferencesRead,
    ReminderPreferencesUpdate,
    SyncRequest,
    SyncResult,
)
from app.services import notification_service
from app.services.auth_service import get_current_user
from app.services.reminder_engine import parse_reminder_time


notifications_router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@notifications_router.get("", response_model=NotificationList)
def get_notifications(
    limit: int = Query(default=30, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return notification_service.list_notifications(db, current_user.id, limit, offset)


@notifications_router.post("/sync", response_model=SyncResult)
def sync_notifications(
    payload: SyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    created = notification_service.sync_reminders(db, current_user, payload.timezone)
    return {
        "created": created,
        "browser_notifications_enabled": bool(current_user.browser_notifications_enabled),
    }


@notifications_router.get("/preferences", response_model=ReminderPreferencesRead)
def get_preferences(current_user: User = Depends(get_current_user)):
    return notification_service.preferences_payload(current_user)


@notifications_router.put("/preferences", response_model=ReminderPreferencesRead)
def put_preferences(
    payload: ReminderPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    if "daily_reminder_time" in data and data["daily_reminder_time"] is not None:
        try:
            parse_reminder_time(data["daily_reminder_time"])
        except ValueError:
            raise HTTPException(status_code=422, detail="Enter a reminder time like 09:00.")
    return notification_service.update_preferences(db, current_user, data)


@notifications_router.post("/read-all")
def read_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updated = notification_service.mark_all_read(db, current_user.id)
    return {"updated": updated}


@notifications_router.post("/{notification_id}/read", response_model=NotificationRead)
def read_one(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notice = notification_service.mark_read(db, current_user.id, notification_id)
    if notice is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notice


@notifications_router.delete("/{notification_id}")
def dismiss_one(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not notification_service.dismiss(db, current_user.id, notification_id):
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification dismissed"}
