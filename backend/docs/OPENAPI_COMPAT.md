# OpenAPI / API contract comparison (Phase 1)

## Method

- Production OpenAPI (Phase 0): live `https://task-manager-api-coral-five.vercel.app/openapi.json`
  lacked sync routes.
- Local branch `feature/unified-sync` FastAPI app registers additive routers in
  `app/main.py`: events, devices, internal (schema-hidden), plus extended
  notifications.

## Additive routes (not on production yet)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/events` | JWT |
| GET | `/api/devices` | JWT |
| POST | `/api/devices/push-tokens` | JWT |
| DELETE | `/api/devices/push-tokens/{device_id}` | JWT |
| GET | `/api/devices/web-push/config` | JWT |
| POST | `/api/devices/test-push` | JWT |
| GET | `/api/notifications/unread-count` | JWT |
| GET/POST | `/api/internal/jobs/tick` | `CRON_SECRET` bearer (not in OpenAPI) |

## Existing contracts preserved

- Personal tasks: `workspace_id` / `project_id` remain optional.
- Auth, task CRUD, collaboration, notification list/read/preferences/sync remain.
- No existing response fields were renamed or removed in this phase.
- Device list returns `token_preview` only (masked); full tokens never leave the owner path.

## Sample responses (local contract)

### `GET /api/events?after=0`

```json
{
  "events": [
    {
      "event_id": "…",
      "type": "task.created",
      "version": 1,
      "entity": {"type": "task", "id": 12},
      "data": {},
      "cursor": 42,
      "created_at": "2026-11-16T10:00:00"
    }
  ],
  "cursor": 42,
  "has_more": false,
  "reset": false,
  "server_time": "2026-11-16T10:00:05+00:00"
}
```

Bootstrap (`after` omitted) returns `"events": []` and a cursor past settled history.

### `GET /api/notifications/unread-count`

```json
{ "unread_count": 3 }
```

### `POST /api/devices/push-tokens`

```json
{
  "id": 1,
  "device_id": "phone-1",
  "platform": "android",
  "provider": "expo",
  "token_preview": "…ijklmnop",
  "app_version": null,
  "created_at": "…",
  "last_seen_at": "…",
  "active": true,
  "disabled_reason": null
}
```

### `POST /api/internal/jobs/tick` (authorized)

```json
{
  "status": "ok",
  "started_at": "2026-11-16T10:00:00",
  "reminders": {"users": 0, "created": 0, "errors": 0},
  "push": {"sent": 0, "retry": 0, "failed": 0, "skipped": 0, "deferred": 0},
  "receipts": {"checked": 0, "delivered": 0, "failed": 0},
  "pruned": {"events": 0, "deliveries": 0}
}
```

Exact tick payload keys may include lease metadata; clients must not depend on
undocumented fields.

## Compatibility stance

New sync APIs are **additive**. Legacy web and mobile personal-task clients can
keep calling existing endpoints until client phases adopt events/devices.
