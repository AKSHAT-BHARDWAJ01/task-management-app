# TaskFlow Staging Environment

Isolated non-production infrastructure for the unified synchronization backend.
This document records **names and metadata only**. Never store passwords, JWT
secrets, CRON secrets, VAPID private keys, access tokens, or full connection
strings here.

Companion runbook: [`STAGING_DEPLOYMENT.md`](./STAGING_DEPLOYMENT.md).

## Status

| Resource | Name | Status |
|----------|------|--------|
| Supabase project | `taskflow-staging` | **Created and verified** (empty DB; no migrations run) |
| Vercel API project | `task-manager-api-staging` | **Created and verified** (undeployed) |
| GitHub Environment | `staging` | **Created and verified** |
| Scheduler workflow | `environment: staging` | Local uncommitted change |
| Staging API deploy | — | **Not attempted** (separate approval) |
| Staging `init_db` / migrations | — | **Not attempted** (separate approval) |

Production (untouched):

- Frontend: `https://task-manager-frontend-self-chi.vercel.app/`
- API: `https://task-manager-api-coral-five.vercel.app/`
- Supabase: `task-manager-db` (`rhfcqtgnliieqhbddmgw`, `ap-northeast-2`)

## Inventory (non-secret)

| Field | Value |
|-------|--------|
| Supabase project name | `taskflow-staging` |
| Supabase project reference | `tdirvfczrvttluhdqmmh` |
| Supabase region | `us-east-1` (chosen for proximity to Vercel `iad1`) |
| Supabase plan | Free (second of two free active projects; pauses after inactivity) |
| Database status | Empty; no production data |
| Connection mode | Transaction pooler port `6543` |
| Pooler host (no credentials) | `aws-0-us-east-1.pooler.supabase.com` |
| Direct DB host (no credentials) | `db.tdirvfczrvttluhdqmmh.supabase.co` |
| Vercel project name | `task-manager-api-staging` |
| Vercel project ID | `prj_01yWSR1M293r57W0bBBCW9Pu9nKa` |
| Vercel team | `akshat-s-workspace` (Hobby) |
| Git repository | `AKSHAT-BHARDWAJ01/task-management-app` |
| Root directory | `backend` |
| Production Branch (staging project) | Currently `main` (cannot set `feature/unified-sync` until pushed) |
| Auto-deploy protection | Ignore Build Step = `exit 0` (blocks git-triggered builds) |
| Generated staging API URL | **Pending first approved deploy** |
| GitHub Environment | `staging` |
| Environment secret names set | `CRON_SECRET` |
| Environment secret pending | `TASKFLOW_API_URL` (needs staging URL after deploy) |

## Backend compatibility (connection mode)

SQLAlchemy already uses `NullPool` and `prepare_threshold=None` for Postgres —
compatible with Supabase shared transaction pooling (`6543`). No engine change
required. Do not enable paid dedicated poolers.

## Environment variable names (staging Vercel Production only)

| Name | Purpose | Status |
|------|---------|--------|
| `DATABASE_URL` | Staging pooler Postgres URI | Set |
| `JWT_SECRET_KEY` | Staging-only JWT secret | Set (new; not production) |
| `CRON_SECRET` | Scheduler bearer secret | Set (new; not on production) |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Set |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Set |
| `VAPID_*` / `EXPO_ACCESS_TOKEN` | Optional push | Unset until needed |

## GitHub Actions scheduler

Workflow: `.github/workflows/scheduler-tick.yml` uses `environment: staging`.

- Secrets resolve from Environment `staging` only.
- `CRON_SECRET` is set; `TASKFLOW_API_URL` awaits staging URL.
- **Schedule limitation:** `on.schedule` runs only from the repository default
  branch. This workflow is not on the default branch yet — ten-minute schedule
  is inactive. Do not merge to `main` without separate approval.
- After deploy: set `TASKFLOW_API_URL` to the staging origin **without** `/api`.

## Future approved deployment steps (do not run yet)

1. Push `feature/unified-sync` only after explicit push approval (APK ignored).
2. Set staging project Production Branch to `feature/unified-sync`.
3. Clear or replace Ignore Build Step for an approved deploy only.
4. Deploy **only** `task-manager-api-staging` (never production API).
5. Cold start runs `init_db()` against staging Postgres.
6. Verify `GET /` and sync tables in staging DB console.
7. Set GitHub `TASKFLOW_API_URL` to the new staging origin.
8. Optional `workflow_dispatch` against staging.
9. Smoke checklist in `STAGING_DEPLOYMENT.md`.

## Rollback (staging only)

- Keep Ignore Build Step or disconnect git on the staging project.
- Pause or delete Free staging Supabase project if abandoning.
- Revoke GitHub Environment `staging` secrets if compromised.
- Never copy staging credentials into production.

## Cost / plan

- Supabase Free second project: **$0** (limit 2 active; may pause after ~1 week idle).
- Vercel Hobby additional project: **no upgrade**.
- No paid add-ons enabled.

## Isolation checklist

- [x] Staging Supabase ref ≠ production ref
- [x] Staging DB host ≠ production DB host
- [x] Staging Vercel project ID ≠ production API project
- [x] Staging URL ≠ `task-manager-api-coral-five.vercel.app` (staging undeployed)
- [x] Staging JWT / CRON generated independently; production env names unchanged
- [x] Production Vercel env vars not modified this session
- [x] No production data imported
- [x] Auto-deploy blocked on staging via Ignore Build Step
