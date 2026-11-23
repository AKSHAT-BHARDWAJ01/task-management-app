import hmac
import os
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas.notification import DeviceRead, EventFeed, NotificationRead, PushTokenRegister, WebPushConfig
from app.services import device_service, event_service, job_service, notification_service, push_service
from app.services.auth_service import get_current_user

events_router = APIRouter(prefix="/api/events", tags=["Sync"])
devices_router = APIRouter(prefix="/api/devices", tags=["Devices"])
internal_router = APIRouter(prefix="/api/internal", tags=["Internal"], include_in_schema=False)


@events_router.get("", response_model=EventFeed)
def get_events(
    after: int | None = Query(default=None, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return event_service.list_events(db, current_user, after, limit)


@devices_router.get("", response_model=list[DeviceRead])
def get_devices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return device_service.list_devices(db, current_user)


@devices_router.post("/push-tokens", response_model=DeviceRead)
def register_push_token(
    payload: PushTokenRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = payload.model_dump()
    return device_service.register(db, current_user, data)


@devices_router.delete("/push-tokens/{device_id}")
def unregister_push_token(device_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not device_service.unregister(db, current_user, device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": "Device removed"}


@devices_router.get("/web-push/config", response_model=WebPushConfig)
def get_web_push_config(_current_user: User = Depends(get_current_user)):
    return push_service.web_push_config()


@devices_router.post("/test-push", response_model=NotificationRead)
def send_test_push(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Queue a test notice for the caller's own devices. One per minute."""
    notice = notification_service.record_test(db, current_user.id, datetime.utcnow())
    if notice is None:
        raise HTTPException(status_code=429, detail="A test notification was already sent this minute")
    return notice


def _authorize_scheduler(authorization: str | None) -> None:
    secret = os.getenv("CRON_SECRET", "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="The scheduler is not configured (CRON_SECRET is not set)")
    if not authorization or not hmac.compare_digest(authorization.encode(), f"Bearer {secret}".encode()):
        raise HTTPException(status_code=401, detail="Not authorized")


@internal_router.api_route("/jobs/tick", methods=["GET", "POST"])
def scheduler_tick(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    _authorize_scheduler(authorization)
    return job_service.run_tick(db)
