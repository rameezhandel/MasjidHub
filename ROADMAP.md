# MasjidHub Roadmap

**Vision:** one platform serving hundreds of masjids. Each masjid is a tenant on a shared
application and database; masjid staff manage their own masjid; the community reaches
every masjid's prayer times, announcements, and events on the web and (later) in a
native mobile app.

## Where we are (done ✅)

| Milestone | Shipped in |
|---|---|
| Multi-tenant foundation: auth (JWT + rotating refresh tokens), roles (`PLATFORM_ADMIN`, `MASJID_ADMIN`, `MASJID_MAINTAINER`), masjid onboarding/suspension, tenant-scoped staff management | #1 |
| Content: prayer times (manual bulk upload), announcements & events with draft→publish lifecycle, public API by masjid slug | #2 |
| Prayer-time auto-calculation from coordinates (11 methods, Hanafi/standard Asr, iqamah offsets, jumu'ah) | #3 |
| Forgot/reset password + provider-agnostic SMTP mailer | #4 |
| **M5** — Staff invitations (invitee sets own password), audit log, scheduled token cleanup | #6 |

103 automated tests (unit + e2e against real PostgreSQL) run in CI on every PR.
Swagger try-it page at `/api/docs`. Docker + docker-compose deployment ready.

## Decisions log

- **Stack:** NestJS + TypeScript + PostgreSQL/Prisma (decided at project start)
- **Tenancy:** shared schema, `masjid_id` scoping enforced in the service layer
- **Frontend:** Next.js **in this repo** (monorepo: `apps/web` next to the API)
- **Mobile:** native apps via **React Native (Expo)** — one codebase for iOS + Android,
  first-class push notifications, app-store presence (`apps/mobile` in the monorepo)
- **Hosting:** start free — **Render free web service + Neon free Postgres**
  (caveat: free web services sleep when idle → ~30 s cold start; Neon free tier is a real,
  non-expiring free Postgres). Upgrade path: Render paid (~$7/mo) + Neon Launch or
  Railway (~$5–10/mo) once real masjids rely on it. Railway has no free tier (one-time
  trial credit only); Render's own free Postgres is deleted after 30 days — hence Neon.
- **Donations:** parked indefinitely; revisit when masjids ask (likely Stripe Connect)

## Upcoming milestones

### M6 — Deploy to the internet 🌍 *(next up — config ready, needs account creation)*
Get a real URL early — everything after this gets exercised in production.
- Neon Postgres (free) + Render web service (free) wired via `render.yaml`
- CI deploy on merge to `main`; `prisma migrate deploy` release step
- Production env checklist (JWT secret, SMTP, CORS, Swagger off/on decision)
- **Exit criteria:** `api.<domain>` serving `/health` green, seeded platform admin can log in

### M7 — Community members *(backend)*
The audience for the mobile app; prerequisite for push notifications.
- `COMMUNITY_MEMBER` role: public self-registration with email verification
- Follow/unfollow masjids (a member follows any number of masjids)
- "My feed": prayer times, announcements, events across followed masjids
- **Exit criteria:** a member can register, verify, follow two masjids, and read a merged feed

### M8 — Media uploads *(backend)*
- Masjid logo + photo gallery via S3-compatible storage (Cloudflare R2 — 10 GB free,
  fits the free-tier strategy), presigned upload URLs, size/type validation
- Exposed on the public masjid profile
- **Exit criteria:** masjid pages aren't text-only anymore

### M9 — Web frontend (`apps/web`, Next.js)
One app, three audiences, server-rendered public pages for SEO.
1. Public masjid pages (`/{slug}`): profile, map, today's prayer times, monthly
   timetable, announcements, events — installable PWA as an interim mobile experience
2. Masjid staff dashboard: timetable generator wizard, announcement/event publishing,
   staff management
3. Platform admin console: masjid directory, onboarding, suspension
- **Exit criteria:** a masjid can be onboarded and publish content without ever seeing Swagger

### M10 — Self-serve masjid onboarding *(backend + web)*
Needed to scale beyond hand-onboarding; builds on M9's public site.
- Public "register your masjid" form → pending request → platform admin approves/rejects
  (approval creates the masjid + sends the admin an invite from M5)
- **Exit criteria:** a new masjid can join with zero platform-admin data entry

### M11 — Native mobile app (`apps/mobile`, React Native / Expo)
- Community app: browse/follow masjids, prayer times with today widget,
  announcements & events feed (uses M7 accounts)
- Ship via Expo EAS to both stores (costs: Apple $99/yr, Google $25 one-time)
- **Exit criteria:** app in both stores; a member logs in and sees their followed masjids

### M12 — Push notifications
- Expo push (wraps FCM/APNs) to members who follow a masjid: new announcement
  published, event published/cancelled; per-user notification preferences
- Web push for the PWA as a bonus
- **Exit criteria:** publishing an announcement buzzes followers' phones within seconds

## Parked / icebox
- **Donations** (Stripe Connect per-masjid payouts) — revisit on demand
- Ramadan-specific features (taraweeh times, iftar countdowns) — natural fit once
  timetables are live in the app
- Masjid websites on custom domains (masjid brings their own domain → their public page)
- Multi-language content (Arabic/Urdu localization)

## Working agreement
Each milestone = one PR (or a few small ones), CI green, e2e-tested against real
Postgres, merged to `main` before the next begins. This file is updated as milestones
ship or priorities change.
