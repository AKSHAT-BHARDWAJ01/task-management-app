# TaskFlow Staging Environment

Isolated non-production infrastructure for the unified synchronization backend.
This document records **names and metadata only**. Never store passwords, JWT
secrets, CRON secrets, VAPID private keys, access tokens, or full connection
strings here.

Companion runbook: [`STAGING_DEPLOYMENT.md`](./STAGING_DEPLOYMENT.md).

## Status

| Resource | Name | Status |
|----------|------|--------|
| Supabase project | `taskflow-staging` | **Created and verified** |
| Vercel API project | `task-manager-api-staging` | **Deployed** |
| Staging API origin | `https://task-manager-api-staging.vercel.app` | **Live** |
| Staging API base | `https://task-manager-api-staging.vercel.app/api` | **Live** |
| GitHub Environment | `staging` | **Created and verified** |
| Scheduler workflow | `environment: staging` | On `feature/unified-sync` (not default branch) |
| Staging API deploy | `task-manager-api-staging` | **Deployed** |
| Staging `init_db` / migrations | Cold start / sync tables | **Applied on deploy** |

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
| Production Branch (staging project) | Staging deploys via CLI / approved manual deploy |
| Auto-deploy protection | Ignore Build Step may still block git-triggered builds |
| Generated staging API URL | `https://task-manager-api-staging.vercel.app` |
| Staging API base (clients) | `https://task-manager-api-staging.vercel.app/api` |
| GitHub Environment | `staging` |
| Environment secret names set | `CRON_SECRET`, `TASKFLOW_API_URL` |

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
- `CRON_SECRET` and `TASKFLOW_API_URL` are set (`TASKFLOW_API_URL` = staging
  origin **without** `/api`).
- **Schedule limitation:** `on.schedule` runs only from the repository default
  branch. This workflow is not on the default branch yet — ten-minute schedule
  is inactive. Do not merge to `main` without separate approval.
- `workflow_dispatch` via GitHub API also requires the workflow file on the
  default branch; until then, trigger `/api/internal/jobs/tick` locally with
  `CRON_SECRET` (never commit or log the value).
- Note: `vercel env pull` cannot decrypt Production **Secret**-type values
  (`CRON_SECRET` comes back as `[SENSITIVE]`).

## Remaining follow-ups

1. Keep production (`coral-five`) untouched; clients must not enable unified sync against it.
2. Merge or copy `scheduler-tick.yml` to the default branch only with approval (enables schedule + `workflow_dispatch`).
3. To tick manually today: `POST /api/internal/jobs/tick` with `Authorization: Bearer <CRON_SECRET>` (value is Vercel/GitHub Secret-type; not recoverable via `vercel env pull`).
4. Optional smoke checklist in `STAGING_DEPLOYMENT.md`.

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
- [x] Staging URL ≠ `task-manager-api-coral-five.vercel.app` (`task-manager-api-staging.vercel.app`)
- [x] Staging JWT / CRON generated independently; production env names unchanged
- [x] Production Vercel env vars not modified this session
- [x] No production data imported
- [x] Auto-deploy blocked on staging via Ignore Build Step
