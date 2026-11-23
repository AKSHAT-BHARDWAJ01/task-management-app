"""Drain the push outbox to Expo and Web Push.

A notification row is the record of what happened. A delivery row is one
attempt stream to one device, so the notification centre never depends on push
succeeding, and "sent" here means only that the provider accepted the message.
Expo receipts are checked later to learn whether Apple or Google took it.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DevicePushToken, Notification, NotificationDelivery, User
from app.services import device_service
from app.services.notification_service import quiet_hours_end

logger = logging.getLogger("taskflow.push")

EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
MAX_ATTEMPTS = 5
EXPO_BATCH = 100
RECEIPT_DELAY = timedelta(minutes=15)
RECEIPT_WINDOW = timedelta(hours=24)

Transport = Callable[[str, list | dict], dict]


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def web_push_config() -> dict:
    public_key = os.getenv("VAPID_PUBLIC_KEY", "").strip()
    private_key = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    return {"enabled": bool(public_key and private_key), "public_key": public_key or None}


def _expo_transport(url: str, body: list | dict) -> dict:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    access_token = os.getenv("EXPO_ACCESS_TOKEN", "").strip()
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    request = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


class WebPushGone(Exception):
    """The browser subscription no longer exists."""


def _web_transport(device: DevicePushToken, payload: dict) -> None:
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={"endpoint": device.token, "keys": {"p256dh": device.web_p256dh, "auth": device.web_auth}},
            data=json.dumps(payload),
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"].strip(),
            vapid_claims={"sub": os.getenv("VAPID_SUBJECT", "mailto:admin@taskflow.local").strip()},
            ttl=24 * 60 * 60,
            timeout=10,
        )
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            raise WebPushGone(str(status)) from exc
        raise


def message_for(notice: Notification) -> dict:
    """The push body. Ids and a server-built link only; the client refetches with auth."""
    return {
        "title": notice.title,
        "body": notice.message,
        "data": {"notification_id": notice.id, "link": notice.link, "type": notice.type},
    }


def _retry(delivery: NotificationDelivery, now: datetime, error: str) -> None:
    delivery.attempts += 1
    delivery.last_error = error[:300]
    if delivery.attempts >= MAX_ATTEMPTS:
        delivery.status = "failed"
    else:
        delivery.next_attempt_at = now + timedelta(minutes=2 ** delivery.attempts)


def drain(
    db: Session,
    now: datetime | None = None,
    *,
    limit: int = 200,
    deadline: float | None = None,
    expo_transport: Transport | None = None,
    web_transport: Callable[[DevicePushToken, dict], None] | None = None,
) -> dict:
    now = now or _now()
    expo_send = expo_transport or _expo_transport
    web_send = web_transport or _web_transport
    counts = {"sent": 0, "retry": 0, "failed": 0, "skipped": 0, "deferred": 0}
    due = list(
        db.scalars(
            select(NotificationDelivery)
            .where(NotificationDelivery.status == "pending", NotificationDelivery.next_attempt_at <= now)
            .order_by(NotificationDelivery.id)
            .limit(limit)
        ).all()
    )
    expo_batch: list[tuple[NotificationDelivery, dict]] = []
    for delivery in due:
        if deadline is not None and time.monotonic() > deadline:
            break
        notice = db.get(Notification, delivery.notification_id)
        device = db.get(DevicePushToken, delivery.device_token_id)
        user = db.get(User, delivery.user_id)
        if notice is None or device is None or device.disabled_at is not None or user is None:
            delivery.status = "cancelled"
            counts["skipped"] += 1
            continue
        if device.user_id != notice.user_id or not user.push_enabled or notice.read_at is not None:
            delivery.status = "cancelled"
            delivery.last_error = "Recipient changed, push turned off, or already read"
            counts["skipped"] += 1
            continue
        quiet_until = quiet_hours_end(user, now)
        if quiet_until is not None:
            delivery.next_attempt_at = quiet_until
            counts["deferred"] += 1
            continue
        message = message_for(notice)
        if delivery.channel == "expo":
            expo_batch.append((delivery, {"to": device.token, "sound": "default", "priority": "high", **message}))
            if len(expo_batch) >= EXPO_BATCH:
                _send_expo(db, expo_batch, expo_send, now, counts)
                expo_batch = []
        elif delivery.channel == "webpush":
            if not web_push_config()["enabled"]:
                delivery.status = "failed"
                delivery.last_error = "Web push is not configured on the server (VAPID keys missing)"
                counts["failed"] += 1
                continue
            try:
                web_send(device, message)
            except WebPushGone:
                device_service.disable(db, device, "Browser subscription expired")
                delivery.status = "failed"
                delivery.last_error = "Subscription gone"
                counts["failed"] += 1
                continue
            except Exception as exc:  # noqa: BLE001 - provider errors are retried, not raised
                _retry(delivery, now, f"Web push error: {type(exc).__name__}")
                counts["retry" if delivery.status == "pending" else "failed"] += 1
                continue
            delivery.attempts += 1
            delivery.status = "sent"
            delivery.sent_at = now
            counts["sent"] += 1
        else:
            delivery.status = "failed"
            delivery.last_error = f"Unknown channel {delivery.channel}"
            counts["failed"] += 1
    if expo_batch:
        _send_expo(db, expo_batch, expo_send, now, counts)
    db.commit()
    return counts


def _send_expo(db: Session, batch, transport: Transport, now: datetime, counts: dict) -> None:
    try:
        response = transport(EXPO_SEND_URL, [message for _, message in batch])
        tickets = response.get("data") or []
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        for delivery, _ in batch:
            _retry(delivery, now, f"Expo unreachable: {type(exc).__name__}")
            counts["retry" if delivery.status == "pending" else "failed"] += 1
        return
    for index, (delivery, _message) in enumerate(batch):
        ticket = tickets[index] if index < len(tickets) else {"status": "error", "message": "Missing ticket"}
        if ticket.get("status") == "ok":
            delivery.attempts += 1
            delivery.status = "sent"
            delivery.sent_at = now
            delivery.provider_ticket_id = ticket.get("id")
            counts["sent"] += 1
            continue
        error = (ticket.get("details") or {}).get("error") or ticket.get("message") or "Expo error"
        if error == "DeviceNotRegistered":
            device = db.get(DevicePushToken, delivery.device_token_id)
            if device is not None:
                device_service.disable(db, device, "Expo: device not registered")
            delivery.status = "failed"
            delivery.last_error = error
            counts["failed"] += 1
        elif error in {"MessageRateExceeded", "Expo error"}:
            _retry(delivery, now, error)
            counts["retry" if delivery.status == "pending" else "failed"] += 1
        else:
            delivery.attempts += 1
            delivery.status = "failed"
            delivery.last_error = str(error)[:300]
            counts["failed"] += 1


def check_receipts(db: Session, now: datetime | None = None, *, transport: Transport | None = None) -> dict:
    now = now or _now()
    send = transport or _expo_transport
    rows = list(
        db.scalars(
            select(NotificationDelivery).where(
                NotificationDelivery.channel == "expo",
                NotificationDelivery.status == "sent",
                NotificationDelivery.provider_ticket_id.is_not(None),
                NotificationDelivery.receipt_checked_at.is_(None),
                NotificationDelivery.sent_at <= now - RECEIPT_DELAY,
                NotificationDelivery.sent_at >= now - RECEIPT_WINDOW,
            ).limit(300)
        ).all()
    )
    counts = {"delivered": 0, "failed": 0, "pending": 0}
    if not rows:
        return counts
    try:
        response = send(EXPO_RECEIPTS_URL, {"ids": [row.provider_ticket_id for row in rows]})
        receipts = response.get("data") or {}
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return counts
    for row in rows:
        receipt = receipts.get(row.provider_ticket_id)
        if receipt is None:
            counts["pending"] += 1
            continue
        row.receipt_checked_at = now
        if receipt.get("status") == "ok":
            row.status = "delivered"
            counts["delivered"] += 1
            continue
        error = (receipt.get("details") or {}).get("error") or receipt.get("message") or "Receipt error"
        row.status = "failed"
        row.last_error = str(error)[:300]
        counts["failed"] += 1
        if error == "DeviceNotRegistered":
            device = db.get(DevicePushToken, row.device_token_id)
            if device is not None:
                device_service.disable(db, device, "Expo: device not registered")
    db.commit()
    return counts
