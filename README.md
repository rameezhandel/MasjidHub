# MasjidHub

Multi-tenant platform for masjids: **one application, one database, many masjids**. Each masjid is a tenant (a row in the `masjids` table); all tenant-owned data carries a `masjid_id` and every request is scoped to the caller's masjid at the API layer.

## Stack

| Concern | Choice |
|---|---|
| Runtime / language | Node.js 22, TypeScript (strict) |
| Framework | NestJS 11 (Express) |
| Database / ORM | PostgreSQL 16, Prisma |
| Auth | JWT access tokens + rotating opaque refresh tokens (reuse detection), argon2id hashing |
| Security | Helmet, rate limiting (`@nestjs/throttler`), CORS allow-list, strict DTO validation |
| Observability | pino structured logging with request IDs, Terminus health checks |
| Docs | Swagger / OpenAPI at `/api/docs` (toggle with `SWAGGER_ENABLED`) |
| Delivery | Docker (multi-stage, non-root), docker-compose, GitHub Actions CI |

## Roles

| Role | Scope | Capabilities |
|---|---|---|
| `PLATFORM_ADMIN` | global (no masjid) | Onboard/list/update any masjid, suspend/activate/archive, manage any masjid's users |
| `MASJID_ADMIN` | their masjid | Update their masjid profile, manage its admins/maintainers |
| `MASJID_MAINTAINER` | their masjid | Read their masjid (more capabilities to come) |

The single platform admin is created by the seed script (`npm run db:seed`) from `PLATFORM_ADMIN_*` env vars — there is no public sign-up.

## Tenant isolation rules

- Users (except the platform admin) belong to exactly one masjid via `masjid_id`.
- Cross-tenant access returns `403` — enforced in services on every masjid-scoped operation and covered by e2e tests.
- Suspending a masjid immediately revokes all of its users' sessions and blocks login until reactivated.
- Deactivating a user (or demoting an admin) revokes their sessions immediately.
- The last active admin of a masjid can never be deactivated or demoted.

## API (v1)

All routes are under `/api/v1`. Interactive docs at `/api/docs`.

```
POST   /auth/login                     credentials -> access + refresh tokens
POST   /auth/refresh                   rotate refresh token (reuse => all sessions revoked)
POST   /auth/logout                    revoke a refresh token
POST   /auth/change-password           revokes all sessions
GET    /auth/me                        current profile incl. masjid

POST   /masjids                        onboard masjid + initial admin   [platform admin]
GET    /masjids                        list/search/paginate             [platform admin]
GET    /masjids/:id                    platform admin: any; members: own
PATCH  /masjids/:id                    platform admin: any; masjid admin: own
PATCH  /masjids/:id/status             ACTIVE | SUSPENDED | ARCHIVED    [platform admin]

POST   /masjids/:masjidId/users        add admin/maintainer             [platform admin, own masjid admin]
GET    /masjids/:masjidId/users        list/filter/paginate             [platform admin, own masjid admin]
GET    /masjids/:masjidId/users/:id
PATCH  /masjids/:masjidId/users/:id    name / role / isActive

GET    /health                         readiness (DB ping)
GET    /health/liveness                liveness
```

## Getting started

### Local development

```bash
cp .env.example .env          # fill in JWT_SECRET etc.
docker compose up db -d       # or any PostgreSQL 16
npm ci
npx prisma migrate dev
npm run db:seed               # creates the platform admin from env
npm run start:dev
```

### Full stack via Docker

```bash
JWT_SECRET=$(openssl rand -base64 48) docker compose up --build
```

This starts Postgres, applies migrations (dedicated `migrate` service, so API replicas never race), then the API on port 3000.

### Tests

```bash
npm test                      # unit tests
npm run test:e2e              # full multi-tenant flow against a real Postgres
```

E2E tests default to `postgresql://postgres:postgres@localhost:5432/masjidhub_test` (override with `DATABASE_URL`); apply migrations first with `npx prisma migrate deploy`.

## Project layout

```
prisma/            schema, migrations, seed
src/
  auth/            login, refresh rotation, JWT strategy
  masjids/         tenant onboarding & management
  users/           tenant-scoped user management
  health/          liveness/readiness
  common/          guards, decorators, filters, pagination
  config/          zod-validated environment
  prisma/          PrismaService
test/              e2e suite
```

## Design notes

- **Why shared-schema multi-tenancy?** Hundreds of masjids on one platform: cheapest to operate, one migration for all tenants, trivially supports platform-wide admin views. Isolation is enforced consistently in the service layer and verified by e2e tests.
- **Why opaque refresh tokens (hashed at rest)?** A DB leak exposes no usable tokens; rotation with reuse detection catches stolen refresh tokens.
- **JWTs re-validate the user on every request**, so deactivation/suspension takes effect immediately rather than at token expiry.
