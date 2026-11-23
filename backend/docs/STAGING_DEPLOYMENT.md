# TaskFlow Backend — Staging Deployment Runbook

Non-production only. Do **not** apply this runbook to production without a separate
approval gate. This document prepares a staging API that includes the unified
synchronization stack (events, devices, cron tick, push outbox).

## 1. Preconditions

- Branch: `feature/unified-sync` (or a staging branch cut from it after review).
- Staging PostgreSQL database (Supabase project or equivalent) that is **not**
  production. Prefer the transaction pooler URI (port `6543`).
- Staging Vercel project (or preview deployment) separate from production, or a
  clearly named Preview environment.
- GitHub Actions secrets can target staging first (`TASKFLOW_API_URL` =
  staging API origin).

Do not rotate production credentials. Do not run migrations against production.

## 2. Required environment variables

Set these on the **staging** API project. Never print or commit real values.

| Name | Purpose |
|------|---------|
| `DATABASE_URL` | Staging Postgres URI (URL-encode password special characters) |
| `JWT_SECRET_KEY` | Staging-only JWT signing secret |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Optional; default `60` |
| `CORS_ORIGINS` | Staging frontend origin(s), comma-separated |
| `CRON_SECRET` | Shared secret for `/api/internal/jobs/tick` |
| `VAPID_PUBLIC_KEY` | Web Push public key (optional until web client phase) |
| `VAPID_PRIVATE_KEY` | Web Push private key (server-only) |
| `VAPID_SUBJECT` | `mailto:` or `https:` contact for VAPID claims |
| `EXPO_ACCESS_TOKEN` | Optional; only if Expo enhanced push security is enabled |

GitHub Actions (for the repository that triggers the tick):

| Secret | Purpose |
|--------|---------|
| `TASKFLOW_API_URL` | Staging API origin, **without** trailing `/api` |
| `CRON_SECRET` | Same value as the API `CRON_SECRET` |

## 3. Schema application order

This backend does **not** use Alembic. Startup calls `init_db()` which:

1. `Base.metadata.create_all` for all registered models (including sync tables:
   `domain_event`, `device_push_token`, `notification_delivery`, `job_lease`).
2. Additive `ALTER TABLE` helpers for legacy columns on `task`, `users`, and
   `notification`.

Staging order:

1. Point `DATABASE_URL` at the empty/staging database.
2. Deploy the API so cold start runs `init_db()`.
3. Hit `GET /` and confirm `db_ready` behaviour / healthy JSON.
4. Confirm tables exist via staging DB console (names above + existing task /
   collaboration tables).

### Rollback considerations

| Change | Rollback approach |
|--------|-------------------|
| New sync tables (`domain_event`, `device_push_token`, `notification_delivery`, `job_lease`) | Drop tables only on staging if abandoning the feature; production must not run this until approved. Data loss of events/devices/deliveries only. |
| Additive user preference columns | Leave columns in place; safe no-op for older code that ignores them. |
| Additive notification entity/link columns | Leave columns; older readers ignore unknown fields. |
| Additive task collaboration FKs (`workspace_id`, `project_id`, …) | Already shipped with Projects foundation; do not drop if collaboration is live. |

Prefer additive forward fixes over destructive rollbacks.

## 4. Scheduler architecture

Vercel serverless cannot host a long-running worker. Scheduling is external:

1. **GitHub Actions** (`.github/workflows/scheduler-tick.yml`) — every 10 minutes
   + `workflow_dispatch`. Primary reminder/push drain trigger.
2. **Vercel Cron** (`backend/vercel.json`) — daily `30 2 * * *` backup call to
   `/api/internal/jobs/tick`.

Both must send `Authorization: Bearer <CRON_SECRET>`.

Server-side protections:

- Missing `CRON_SECRET` → `503`.
- Wrong/missing bearer → `401`.
- `JobLease` skips overlapping runs (`status: skipped`).
- Reminder idempotency keys prevent duplicate notification rows.
- Delivery unique constraint `(notification_id, device_token_id)`.

No in-memory Python timer is used as the production scheduler.

### Cost / ops notes

- GitHub Actions free tier is usually enough for `*/10` ticks.
- Each tick is one HTTP request + short DB work (lease, reminder sync, push
  drain, prune). Keep `maxDuration` ≥ 60s on the function.
- If push volume grows large, consider a dedicated worker (Railway/Fly/Render)
  draining the outbox; not required for staging validation.

## 5. Staging smoke checklist

After deploy (manual; do not automate against production):

1. `GET /` — healthy.
2. Register/login with a staging-only user.
3. `GET /api/events` — bootstrap cursor, empty events.
4. Create a personal task → poll `GET /api/events?after=<cursor>` after settle
   window (~5s) → see `task.created`.
5. `POST /api/devices/push-tokens` with a fake Expo token shape → `GET /api/devices`
   shows masked preview only.
6. `GET /api/notifications/unread-count`.
7. `POST /api/internal/jobs/tick` with wrong secret → `401`; with correct secret →
   `ok` or `skipped`.
8. Trigger Actions `workflow_dispatch` against staging URL.
9. Confirm no production database writes (staging DSN only).

## 6. Explicit non-goals for this runbook

- Do not deploy production.
- Do not change production env vars.
- Do not enable web service-worker / mobile Expo client integration yet.
- Do not send real push to production users; use staging tokens and mocked
  transports in automated tests.

## 7. Approval gate

Staging deploy requires explicit confirmation that:

1. A staging database exists and credentials are available.
2. A staging/preview Vercel target exists.
3. GitHub secrets for staging are ready (or temporarily pointed at staging).

Until that confirmation, stop after local verification and this runbook.
