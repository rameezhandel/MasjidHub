process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret-with-enough-length-000000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/masjidhub_test';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MasjidStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const PLATFORM_ADMIN = { email: 'platform@e2e.local', password: 'platform-admin-pass-123' };
const MASJID_A_ADMIN = { email: 'admin-a@e2e.local', password: 'masjid-a-admin-pass-123' };
const MASJID_B_ADMIN = { email: 'admin-b@e2e.local', password: 'masjid-b-admin-pass-123' };
const MAINTAINER_A = { email: 'maint-a@e2e.local', password: 'maintainer-a-pass-123' };

describe('MasjidHub API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  let platformToken: string;
  let masjidAId: string;
  let masjidBId: string;
  let adminAToken: string;
  let maintainerAId: string;

  const login = (creds: { email: string; password: string }) =>
    request(http).post('/api/v1/auth/login').send(creds);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    prisma = app.get(PrismaService);
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.masjid.deleteMany();

    await prisma.user.create({
      data: {
        email: PLATFORM_ADMIN.email,
        passwordHash: await AuthService.hashPassword(PLATFORM_ADMIN.password),
        firstName: 'Platform',
        lastName: 'Admin',
        role: UserRole.PLATFORM_ADMIN,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves liveness without auth', async () => {
    await request(http).get('/api/v1/health/liveness').expect(200, { status: 'ok' });
  });

  it('rejects unauthenticated access to protected routes', async () => {
    await request(http).get('/api/v1/masjids').expect(401);
  });

  it('logs in the platform admin', async () => {
    const res = await login(PLATFORM_ADMIN).expect(200);
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.user.role).toBe('PLATFORM_ADMIN');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    platformToken = res.body.accessToken;
  });

  it('rejects a bad password', async () => {
    await login({ email: PLATFORM_ADMIN.email, password: 'wrong-password-123' }).expect(401);
  });

  it('platform admin onboards masjid A with its admin', async () => {
    const res = await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Masjid Al-Noor',
        city: 'Dearborn',
        timezone: 'America/Detroit',
        admin: { ...MASJID_A_ADMIN, firstName: 'Ahmed', lastName: 'Khan' },
      })
      .expect(201);
    expect(res.body.slug).toBe('masjid-al-noor');
    expect(res.body.admin.role).toBe('MASJID_ADMIN');
    masjidAId = res.body.id;
  });

  it('platform admin onboards masjid B', async () => {
    const res = await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Masjid As-Salam',
        city: 'Chicago',
        admin: { ...MASJID_B_ADMIN, firstName: 'Bilal', lastName: 'Omar' },
      })
      .expect(201);
    masjidBId = res.body.id;
  });

  it('rejects onboarding with a duplicate admin email', async () => {
    await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Masjid Duplicate',
        admin: { ...MASJID_A_ADMIN, firstName: 'Dup', lastName: 'User' },
      })
      .expect(409);
  });

  it('lists masjids with pagination meta (platform admin only)', async () => {
    const res = await request(http)
      .get('/api/v1/masjids?page=1&pageSize=10')
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data).toHaveLength(2);
  });

  it('logs in masjid A admin', async () => {
    const res = await login(MASJID_A_ADMIN).expect(200);
    adminAToken = res.body.accessToken;
    expect(res.body.user.masjidId).toBe(masjidAId);
  });

  it('masjid admin cannot list all masjids', async () => {
    await request(http)
      .get('/api/v1/masjids')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(403);
  });

  it('masjid admin reads own masjid but not the other tenant', async () => {
    await request(http)
      .get(`/api/v1/masjids/${masjidAId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    await request(http)
      .get(`/api/v1/masjids/${masjidBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(403);
  });

  it('masjid admin updates own masjid but not the other tenant', async () => {
    const res = await request(http)
      .patch(`/api/v1/masjids/${masjidAId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ phone: '+1-313-555-0100' })
      .expect(200);
    expect(res.body.phone).toBe('+1-313-555-0100');

    await request(http)
      .patch(`/api/v1/masjids/${masjidBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ phone: '+1-000-000-0000' })
      .expect(403);
  });

  it('masjid admin cannot change masjid status', async () => {
    await request(http)
      .patch(`/api/v1/masjids/${masjidAId}/status`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ status: MasjidStatus.ACTIVE })
      .expect(403);
  });

  it('masjid admin adds a maintainer to their own masjid only', async () => {
    const res = await request(http)
      .post(`/api/v1/masjids/${masjidAId}/users`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        ...MAINTAINER_A,
        firstName: 'Musa',
        lastName: 'Ali',
        role: UserRole.MASJID_MAINTAINER,
      })
      .expect(201);
    maintainerAId = res.body.id;
    expect(res.body.role).toBe('MASJID_MAINTAINER');

    await request(http)
      .post(`/api/v1/masjids/${masjidBId}/users`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        email: 'intruder@e2e.local',
        password: 'intruder-pass-1234',
        firstName: 'In',
        lastName: 'Truder',
        role: UserRole.MASJID_MAINTAINER,
      })
      .expect(403);
  });

  it('rejects weak passwords and platform-admin role escalation', async () => {
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/users`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        email: 'weak@e2e.local',
        password: 'short',
        firstName: 'Weak',
        lastName: 'Pass',
        role: UserRole.MASJID_MAINTAINER,
      })
      .expect(400);

    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/users`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        email: 'sneaky@e2e.local',
        password: 'long-enough-password',
        firstName: 'Sneaky',
        lastName: 'User',
        role: UserRole.PLATFORM_ADMIN,
      })
      .expect(400);
  });

  it('maintainer can read their masjid but cannot manage users', async () => {
    const res = await login(MAINTAINER_A).expect(200);
    const maintainerToken = res.body.accessToken as string;

    await request(http)
      .get(`/api/v1/masjids/${masjidAId}`)
      .set('Authorization', `Bearer ${maintainerToken}`)
      .expect(200);

    await request(http)
      .get(`/api/v1/masjids/${masjidAId}/users`)
      .set('Authorization', `Bearer ${maintainerToken}`)
      .expect(403);
  });

  it('blocks deactivating the last active masjid admin', async () => {
    const users = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/users?role=MASJID_ADMIN`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    const adminAId = users.body.data[0].id as string;

    await request(http)
      .patch(`/api/v1/masjids/${masjidAId}/users/${adminAId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ isActive: false })
      .expect(409);
  });

  it('deactivating a maintainer locks them out immediately', async () => {
    const res = await login(MAINTAINER_A).expect(200);
    const maintainerToken = res.body.accessToken as string;

    await request(http)
      .patch(`/api/v1/masjids/${masjidAId}/users/${maintainerAId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(http)
      .get(`/api/v1/masjids/${masjidAId}`)
      .set('Authorization', `Bearer ${maintainerToken}`)
      .expect(401);
    await login(MAINTAINER_A).expect(403);

    await request(http)
      .patch(`/api/v1/masjids/${masjidAId}/users/${maintainerAId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ isActive: true })
      .expect(200);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const first = await login(MASJID_B_ADMIN).expect(200);
    const firstRefresh = first.body.refreshToken as string;

    const second = await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(200);
    const secondRefresh = second.body.refreshToken as string;
    expect(secondRefresh).not.toBe(firstRefresh);

    // Reusing the rotated token is treated as compromise…
    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(401);
    // …which revokes the newer token too.
    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: secondRefresh })
      .expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const session = await login(MASJID_B_ADMIN).expect(200);
    await request(http)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${session.body.accessToken}`)
      .send({ refreshToken: session.body.refreshToken })
      .expect(204);
    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.body.refreshToken })
      .expect(401);
  });

  it('suspending a masjid locks its users out immediately', async () => {
    await request(http)
      .patch(`/api/v1/masjids/${masjidAId}/status`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ status: MasjidStatus.SUSPENDED })
      .expect(200);

    // Existing access token no longer works, and login is blocked.
    await request(http)
      .get(`/api/v1/masjids/${masjidAId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(401);
    await login(MASJID_A_ADMIN).expect(403);

    // Reactivation restores access.
    await request(http)
      .patch(`/api/v1/masjids/${masjidAId}/status`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ status: MasjidStatus.ACTIVE })
      .expect(200);
    await login(MASJID_A_ADMIN).expect(200);
  });

  it('me returns the profile with masjid context', async () => {
    const session = await login(MASJID_A_ADMIN).expect(200);
    const res = await request(http)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.body.accessToken}`)
      .expect(200);
    expect(res.body.email).toBe(MASJID_A_ADMIN.email);
    expect(res.body.masjid.id).toBe(masjidAId);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('change-password revokes existing sessions', async () => {
    const session = await login(MASJID_B_ADMIN).expect(200);
    const newPassword = 'brand-new-password-456';

    await request(http)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${session.body.accessToken}`)
      .send({ currentPassword: MASJID_B_ADMIN.password, newPassword })
      .expect(204);

    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.body.refreshToken })
      .expect(401);
    await login(MASJID_B_ADMIN).expect(401);
    await login({ email: MASJID_B_ADMIN.email, password: newPassword }).expect(200);
  });
});
