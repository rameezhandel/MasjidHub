# Deploying MasjidHub (free tier)

Target setup — **$0/month**:

| Piece | Provider | Free-tier notes |
|---|---|---|
| API | Render (free web service) | Sleeps after ~15 min idle → first request takes ~30–60 s to wake. Fine for evaluation; upgrade to Starter (~$7/mo) removes sleeping. |
| PostgreSQL | Neon (free plan) | Genuinely free and non-expiring. Autosuspends when idle, wakes in ~1 s. |
| Email (optional) | Any SMTP provider | Without `SMTP_URL`, reset/invite links are only logged — set this up before inviting real people. |

Everything is driven by [`render.yaml`](./render.yaml) — Render reads it straight from the repo.

## 1. Create the database (Neon)

1. Sign up at https://neon.tech (GitHub login works).
2. Create a project, e.g. `masjidhub` — choose the region closest to your Render region (e.g. AWS `us-west-2` for Render Oregon).
3. On the project dashboard, copy the **connection string** and make sure it ends with `?sslmode=require`. It looks like:
   `postgresql://user:password@ep-xxxx.us-west-2.aws.neon.tech/neondb?sslmode=require`

## 2. Deploy the API (Render)

1. Sign up at https://render.com with your GitHub account and grant it access to this repository.
2. Click **New → Blueprint**, pick this repo — Render detects `render.yaml` automatically.
3. When prompted for environment variables, paste the Neon connection string as `DATABASE_URL`. (`JWT_SECRET` is generated for you; `SMTP_URL` can stay empty for now.)
4. Click **Apply**. First deploy takes a few minutes: build → `prisma migrate deploy` → start.
5. Verify: open `https://<your-service>.onrender.com/api/v1/health` — expect `{"status":"ok",…"database":{"status":"up"}}`.

Every merge to `main` now deploys automatically.

## 3. Seed the platform admin (one time)

Run locally against the Neon database (the schema is already migrated by step 2):

```bash
git clone <this repo> && cd MasjidHub && npm ci
DATABASE_URL='<your neon connection string>' \
PLATFORM_ADMIN_EMAIL='you@example.com' \
PLATFORM_ADMIN_PASSWORD='a-strong-password-of-12+-chars' \
npm run db:seed
```

The seed is idempotent — running it twice does nothing the second time.

## 4. Smoke test

Open `https://<your-service>.onrender.com/api/docs`, log in via `POST /auth/login` with the seeded admin, click **Authorize**, paste the `accessToken`, and onboard your first masjid via `POST /masjids`.

## Optional next steps

- **Email**: create a free account at any SMTP provider (Resend, Brevo, SES, …) and set `SMTP_URL` (format: `smtps://user:pass@host:465`) in the Render dashboard → invites and password resets start sending for real.
- **Custom domain**: Render dashboard → Settings → Custom Domains (free, includes TLS). Update `APP_BASE_URL` accordingly.
- **Going production-grade later**: upgrade the Render service to Starter (no sleeping), move `SWAGGER_ENABLED` to `false`, set `CORS_ORIGINS` to your frontend origin, and consider Neon's paid tier for more storage/compute.

## Troubleshooting

- **First request hangs ~1 min**: the free service was asleep — that's the documented cold start.
- **`P1001 Can't reach database server`**: check the `DATABASE_URL` ends with `?sslmode=require` and the Neon project isn't paused in an unexpected region.
- **Login works locally but 401 in production**: each environment has its own `JWT_SECRET`; tokens are not portable between them — log in against the deployed API.
