# Deploy backend to Render

This backend is in the `backend/` folder and is ready for Render via the root `render.yaml` Blueprint.

## 1) Push this repository

Push to:
- `git@github.com:tanishq1101/mock-interviewer-server.git`

## 2) Create service from Blueprint in Render

1. Open Render Dashboard.
2. Click **New +** → **Blueprint**.
3. Connect `tanishq1101/mock-interviewer-server`.
4. Render will detect `render.yaml` and create `mock-interviewer-backend`.

## 3) Set required environment variables

In Render service settings, ensure:

- `GROQ_API_KEY` (required)
- `DATABASE_URL` (recommended for dashboard/history)
- `CORS_ORIGINS` includes your frontend URL:
  - `https://mock-interviewer-client.vercel.app`

`NODE_ENV=production` is already set in `render.yaml`.

## 4) Verify health check

After deploy, open:

- `https://<your-render-service>.onrender.com/api/health`

Expected response includes `status: "ok"`.

## Notes

- If `GROQ_API_KEY` is missing, backend startup will fail by design.
- If `DATABASE_URL` is missing, interview generation still works, but dashboard/history endpoints return `503` for DB-dependent operations.
