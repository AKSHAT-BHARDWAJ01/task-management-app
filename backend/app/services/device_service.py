"""Push-token registry. Tokens are only ever returned to their owner, masked."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DevicePushToken, NotificationDelivery, User


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def device_payload(device: DevicePushToken) -> dict:
    return {
        "id": device.id,
        "device_id": device.device_id,
        "platform": device.platform,
        "provider": device.provider,
        "token_preview": f"…{device.token[-6:]}" if device.token else None,
        "app_version": device.app_version,
        "created_at": device.created_at,
        "last_seen_at": device.last_seen_at,
        "active": device.disabled_at is None,
        "disabled_reason": device.disabled_reason,
    }


def register(db: Session, user: User, data: dict) -> dict:
    digest = token_hash(data["token"])
    # One physical token belongs to one signed-in account. If another account
    # (or an old install id) holds it, that registration is replaced.
    stale = db.scalar(select(DevicePushToken).where(DevicePushToken.token_hash == digest))
    if stale is not None and not (stale.user_id == user.id and stale.device_id == data["device_id"]):
        _cancel_pending(db, stale.id)
        db.delete(stale)
        db.flush()
    device = db.scalar(
        select(DevicePushToken).where(DevicePushToken.user_id == user.id, DevicePushToken.device_id == data["device_id"])
    )
    now = _now()
    keys = data.get("keys") or {}
    if device is None:
        device = DevicePushToken(user_id=user.id, device_id=data["device_id"], created_at=now)
        db.add(device)
    elif device.token_hash != digest:
        _cancel_pending(db, device.id)
    device.platform = data["platform"]
    device.provider = data["provider"]
    device.token = data["token"]
    device.token_hash = digest
    device.web_p256dh = keys.get("p256dh")
    device.web_auth = keys.get("auth")
    device.app_version = data.get("app_version")
    device.last_seen_at = now
    device.disabled_at = None
    device.disabled_reason = None
    db.commit()
    db.refresh(device)
    return device_payload(device)


def list_devices(db: Session, user: User) -> list[dict]:
    rows = db.scalars(
        select(DevicePushToken).where(DevicePushToken.user_id == user.id).order_by(DevicePushToken.last_seen_at.desc())
    ).all()
    return [device_payload(row) for row in rows]


def unregister(db: Session, user: User, device_id: str) -> bool:
    device = db.scalar(
        select(DevicePushToken).where(DevicePushToken.user_id == user.id, DevicePushToken.device_id == device_id)
    )
    if device is None:
        return False
    _cancel_pending(db, device.id)
    db.delete(device)
    db.commit()
    return True


def disable(db: Session, device: DevicePushToken, reason: str) -> None:
    device.disabled_at = _now()
    device.disabled_reason = reason[:120]
    _cancel_pending(db, device.id)


def _cancel_pending(db: Session, device_token_id: int) -> None:
    db.query(NotificationDelivery).filter(
        NotificationDelivery.device_token_id == device_token_id,
        NotificationDelivery.status == "pending",
    ).update({NotificationDelivery.status: "cancelled"}, synchronize_session=False)
