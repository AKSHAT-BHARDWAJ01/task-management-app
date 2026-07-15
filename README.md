# task-management-app
A full-stack task management application

## Vercel deployment

This project is prepared for a Vercel deployment with:

- a Python serverless function for the FastAPI backend in [api/index.py](api/index.py)
- a static frontend build from [frontend](frontend)
- API rewrites from /api/* to the FastAPI function via [vercel.json](vercel.json)

### Required environment variables

Set these in the Vercel dashboard for the production project:

- DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
- JWT_SECRET_KEY=<strong-random-secret>
- CORS_ORIGINS=https://<your-vercel-app>.vercel.app
- VITE_API_BASE_URL=/api

### Production database recommendation

Use a managed PostgreSQL service such as Supabase, Neon, or another hosted Postgres provider. The backend already reads DATABASE_URL from the environment, so it will work with any standard Postgres connection string.

### Commands

- npm run build
- npm run deploy
