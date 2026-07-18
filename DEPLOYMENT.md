# Deploying MasjidHub (free tier)

Target setup — **$0/month** — the API and the web app both on Render, backed by Neon Postgres:

| Piece | Provider | Free-tier notes |
|---|---|---|
| API (`masjidhub-api`) | Render (free web service) | Sleeps after ~15 min idle → first request takes ~30–60 s to wake. Fine for evaluation; upgrade to Starter (~$7/mo) removes sleeping. |
| Web (`masjidhub-web`) | Render (free web service) | Same cold-start behaviour. Next.js runs as a Node server (`next start`), not a static export. |
| PostgreSQL | Neon (free plan) | Genuinely free and non-expiring. Autosuspends when idle, wakes in ~1 s. |
| Email (optional) | Any SMTP provider | Without `SMTP_URL`, reset/invite links are only logged — set this up before inviting real people. |

Both services are defined in [`render.yaml`](./render.yaml) — Render reads it straight from the repo, so a single **Blueprint** creates both at once. They get predictable URLs from their names:

- API → `https://masjidhub-api.onrender.com`
- Web → `https://masjidhub-web.onrender.com`

> If either name is already taken in your Render account, Render appends a random suffix. Update the three cross-referencing URLs in `render.yaml` (`CORS_ORIGINS`, `APP_BASE_URL`, `NEXT_PUBLIC_API_URL`) to match the real URLs, commit, and push.

## 1. Create the database (Neon)

1. Sign up at https://neon.tech (GitHub login works).
2. Create a project, e.g. `masjidhub` — choose the region closest to your Render region (e.g. AWS `us-west-2` for Render Oregon).
3. On the project dashboard, copy the **connection string** and make sure it ends with `?sslmode=require`. It looks like:
   `postgresql://user:password@ep-xxxx.us-west-2.aws.neon.tech/neondb?sslmode=require`

## 2. Deploy both services (Render Blueprint)

1. Sign up at https://render.com with your GitHub account and grant it access to this repository.
2. Click **New → Blueprint**, pick this repo — Render detects `render.yaml` and shows **two** services (`masjidhub-api`, `masjidhub-web`).
3. When prompted for the `sync: false` variables, set:
   - **`DATABASE_URL`** (on `masjidhub-api`) → the Neon connection string from step 1.
   - **`SMTP_URL`** (on `masjidhub-api`) → leave empty for now.
   - `JWT_SECRET` is generated for you; every other variable (CORS, API/app URLs) is already wired in the blueprint.
4. Click **Apply**. First deploy takes a few minutes:
   - API: build → `prisma migrate deploy` → start.
   - Web: `npm ci && npm run build` in `web/` → `next start`.
5. Verify each service:
   - API health: `https://masjidhub-api.onrender.com/api/v1/health` → `{"status":"ok",…"database":{"status":"up"}}`.
   - Web: `https://masjidhub-web.onrender.com` → the landing page loads.

Every merge to `main` now redeploys both services automatically.

### How the two services find each other

- The browser loads the web app, which calls the API at **`NEXT_PUBLIC_API_URL`** (inlined at build time).
- The API only accepts browser calls from origins in **`CORS_ORIGINS`** — set to the web app's URL.
- Password-reset and invite emails link into the web app via **`APP_BASE_URL`** (`/reset-password`, `/accept-invite`).

All three are pre-set in `render.yaml`; you only touch them if a service URL differs from the default.

## 3. Seed the platform admin (one time)

Run locally against the Neon database (the schema is already migrated by step 2):

```bash
git clone <this repo> && cd MasjidHub && npm ci
DATABASE_URL='<your neon connection string>' \
PLATFORM_ADMIN_EMAIL='you@example.com' \
PLATFORM_ADMIN_PASSWORD='a-strong-password-of-12+-chars' \
npm run db:seed
```

The seed is idempotent — running it twice does nothing the second time. There is no public sign-up; this is the only way the first admin is created.

## 4. Smoke test

1. Open `https://masjidhub-web.onrender.com` and log in with the seeded admin.
2. As the platform admin, onboard your first masjid (name + initial masjid admin).
3. Log in as that masjid admin and add households, prayer times, announcements, etc.

(Prefer the raw API? `https://masjidhub-api.onrender.com/api/docs` → log in via `POST /auth/login`, **Authorize** with the `accessToken`, then `POST /masjids`.)

## Optional next steps

- **Email**: create a free account at any SMTP provider (Resend, Brevo, SES, …) and set `SMTP_URL` (format: `smtps://user:pass@host:465`) on `masjidhub-api` in the Render dashboard → invites and password resets start sending for real.
- **Custom domains**: Render dashboard → each service → Settings → Custom Domains (free, includes TLS). After pointing a domain at the web app, update `APP_BASE_URL` (API) and `CORS_ORIGINS` (API) to the web domain, and `NEXT_PUBLIC_API_URL` (web) to the API domain.
- **Hide API docs**: set `SWAGGER_ENABLED=false` on `masjidhub-api` once you don't need the interactive docs.
- **Going production-grade later**: upgrade both Render services to Starter (no sleeping) and consider Neon's paid tier for more storage/compute.

## Troubleshooting

- **First request hangs ~1 min**: the free service was asleep — that's the documented cold start (applies to both API and web).
- **`P1001 Can't reach database server`**: check `DATABASE_URL` ends with `?sslmode=require` and the Neon project isn't paused in an unexpected region.
- **Web loads but every API call fails with a CORS error**: `CORS_ORIGINS` on the API must exactly equal the web app's origin (scheme + host, no trailing slash). Fix it in `render.yaml` or the dashboard and redeploy the API.
- **Web calls the wrong API URL**: `NEXT_PUBLIC_API_URL` is baked in at build time — after changing it you must **redeploy the web service** (a restart isn't enough).
- **Login works locally but 401 in production**: each environment has its own `JWT_SECRET`; tokens are not portable between them — log in against the deployed API.
