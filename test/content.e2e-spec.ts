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

const PLATFORM_ADMIN = { email: 'platform@content-e2e.local', password: 'platform-admin-pass-123' };
const ADMIN_A = { email: 'admin-a@content-e2e.local', password: 'masjid-a-admin-pass-123' };
const MAINTAINER_A = { email: 'maint-a@content-e2e.local', password: 'maintainer-a-pass-123' };
const ADMIN_B = { email: 'admin-b@content-e2e.local', password: 'masjid-b-admin-pass-123' };

describe('Content & public API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  let platformToken: string;
  let maintainerToken: string;
  let adminBToken: string;
  let masjidAId: string;
  let announcementId: string;

  const login = async (creds: { email: string; password: string }): Promise<string> => {
    const res = await request(http).post('/api/v1/auth/login').send(creds).expect(200);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    prisma = app.get(PrismaService);
    await prisma.refreshToken.deleteMany();
    await prisma.announcement.deleteMany();
    await prisma.event.deleteMany();
    await prisma.prayerTimetableEntry.deleteMany();
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
    platformToken = await login(PLATFORM_ADMIN);

    const masjidA = await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Masjid Content',
        city: 'Toronto',
        timezone: 'America/Toronto',
        admin: { ...ADMIN_A, firstName: 'Ahmed', lastName: 'Khan' },
      })
      .expect(201);
    masjidAId = masjidA.body.id;

    await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Masjid Other',
        admin: { ...ADMIN_B, firstName: 'Bilal', lastName: 'Omar' },
      })
      .expect(201);

    const adminAToken = await login(ADMIN_A);
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/users`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        ...MAINTAINER_A,
        firstName: 'Musa',
        lastName: 'Ali',
        role: UserRole.MASJID_MAINTAINER,
      })
      .expect(201);
    maintainerToken = await login(MAINTAINER_A);
    adminBToken = await login(ADMIN_B);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('prayer times', () => {
    it('maintainer bulk-upserts the timetable for their masjid', async () => {
      const res = await request(http)
        .put(`/api/v1/masjids/${masjidAId}/prayer-times`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({
          entries: [
            {
              date: '2099-08-01',
              fajr: '04:45',
              fajrIqamah: '05:15',
              dhuhr: '13:10',
              asr: '17:05',
              maghrib: '20:32',
              isha: '22:05',
              jumuah1: '13:30',
            },
            {
              date: '2099-08-02',
              fajr: '04:47',
              dhuhr: '13:10',
              asr: '17:04',
              maghrib: '20:30',
              isha: '22:03',
            },
          ],
        })
        .expect(200);
      expect(res.body.count).toBe(2);
    });

    it('upsert is idempotent and updates in place', async () => {
      await request(http)
        .put(`/api/v1/masjids/${masjidAId}/prayer-times`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({
          entries: [
            {
              date: '2099-08-01',
              fajr: '04:50',
              dhuhr: '13:10',
              asr: '17:05',
              maghrib: '20:32',
              isha: '22:05',
            },
          ],
        })
        .expect(200);

      const res = await request(http)
        .get(`/api/v1/masjids/${masjidAId}/prayer-times?from=2099-08-01&to=2099-08-01`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].fajr).toBe('04:50');
      expect(res.body[0].date).toBe('2099-08-01');
    });

    it('rejects invalid times and cross-tenant writes', async () => {
      await request(http)
        .put(`/api/v1/masjids/${masjidAId}/prayer-times`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({
          entries: [
            {
              date: '2099-08-03',
              fajr: '25:00',
              dhuhr: '13:10',
              asr: '17:05',
              maghrib: '20:32',
              isha: '22:05',
            },
          ],
        })
        .expect(400);

      await request(http)
        .put(`/api/v1/masjids/${masjidAId}/prayer-times`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({
          entries: [
            {
              date: '2099-08-03',
              fajr: '04:45',
              dhuhr: '13:10',
              asr: '17:05',
              maghrib: '20:32',
              isha: '22:05',
            },
          ],
        })
        .expect(403);
    });
  });

  describe('prayer time auto-calculation', () => {
    it('refuses to generate before coordinates are set', async () => {
      await request(http)
        .post(`/api/v1/masjids/${masjidAId}/prayer-times/generate`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({ from: '2099-09-01', to: '2099-09-07' })
        .expect(409);
    });

    it('generates a week from coordinates with iqamah offsets and jumuah', async () => {
      const adminAToken = await login(ADMIN_A);
      await request(http)
        .patch(`/api/v1/masjids/${masjidAId}`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ latitude: 43.6532, longitude: -79.3832, calculationMethod: 'ISNA' })
        .expect(200);

      // 2099-09-04 is a Friday.
      const res = await request(http)
        .post(`/api/v1/masjids/${masjidAId}/prayer-times/generate`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({
          from: '2099-09-01',
          to: '2099-09-07',
          iqamahOffsets: { fajr: 20, isha: 10 },
          jumuah1: '13:30',
        })
        .expect(200);
      expect(res.body).toEqual({ generated: 7, skipped: 0 });

      const list = await request(http)
        .get(`/api/v1/masjids/${masjidAId}/prayer-times?from=2099-09-01&to=2099-09-07`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .expect(200);
      expect(list.body).toHaveLength(7);

      const friday = list.body.find((e: { date: string }) => e.date === '2099-09-04');
      const saturday = list.body.find((e: { date: string }) => e.date === '2099-09-05');
      expect(friday.jumuah1).toBe('13:30');
      expect(saturday.jumuah1).toBeNull();
      expect(friday.fajr).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(friday.fajrIqamah).not.toBeNull();
      expect(friday.dhuhrIqamah).toBeNull();
    });

    it('keeps existing entries unless overwrite is set', async () => {
      const again = await request(http)
        .post(`/api/v1/masjids/${masjidAId}/prayer-times/generate`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({ from: '2099-09-01', to: '2099-09-08' })
        .expect(200);
      expect(again.body).toEqual({ generated: 1, skipped: 7 });

      const overwrite = await request(http)
        .post(`/api/v1/masjids/${masjidAId}/prayer-times/generate`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({ from: '2099-09-01', to: '2099-09-08', overwrite: true })
        .expect(200);
      expect(overwrite.body).toEqual({ generated: 8, skipped: 0 });
    });

    it('rejects inverted and oversized ranges, and cross-tenant generation', async () => {
      await request(http)
        .post(`/api/v1/masjids/${masjidAId}/prayer-times/generate`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({ from: '2099-09-07', to: '2099-09-01' })
        .expect(400);

      await request(http)
        .post(`/api/v1/masjids/${masjidAId}/prayer-times/generate`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({ from: '2099-01-01', to: '2100-06-01' })
        .expect(400);

      await request(http)
        .post(`/api/v1/masjids/${masjidAId}/prayer-times/generate`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({ from: '2099-09-01', to: '2099-09-07' })
        .expect(403);
    });
  });

  describe('announcements', () => {
    it('maintainer creates a draft, invisible publicly, then publishes', async () => {
      const created = await request(http)
        .post(`/api/v1/masjids/${masjidAId}/announcements`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({ title: 'Ramadan timetable', body: 'Coming soon in shaa Allah.' })
        .expect(201);
      announcementId = created.body.id;
      expect(created.body.status).toBe('DRAFT');
      expect(created.body.publishedAt).toBeNull();

      const publicBefore = await request(http)
        .get('/api/v1/public/masjids/masjid-content/announcements')
        .expect(200);
      expect(publicBefore.body.meta.total).toBe(0);

      const published = await request(http)
        .patch(`/api/v1/masjids/${masjidAId}/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({ status: 'PUBLISHED' })
        .expect(200);
      expect(published.body.publishedAt).not.toBeNull();

      const publicAfter = await request(http)
        .get('/api/v1/public/masjids/masjid-content/announcements')
        .expect(200);
      expect(publicAfter.body.meta.total).toBe(1);
      expect(publicAfter.body.data[0].title).toBe('Ramadan timetable');
    });

    it('cross-tenant announcement writes are blocked', async () => {
      await request(http)
        .post(`/api/v1/masjids/${masjidAId}/announcements`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({ title: 'Intrusion', body: 'nope' })
        .expect(403);
    });

    it('maintainers cannot hard-delete; admins can', async () => {
      await request(http)
        .delete(`/api/v1/masjids/${masjidAId}/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .expect(403);

      await request(http)
        .delete(`/api/v1/masjids/${masjidAId}/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${platformToken}`)
        .expect(204);
    });
  });

  describe('events', () => {
    it('creates and publishes an upcoming event, visible publicly', async () => {
      const created = await request(http)
        .post(`/api/v1/masjids/${masjidAId}/events`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({
          title: 'Community iftar',
          startsAt: '2099-08-15T18:30:00Z',
          endsAt: '2099-08-15T21:00:00Z',
          status: 'PUBLISHED',
        })
        .expect(201);
      expect(created.body.status).toBe('PUBLISHED');

      const publicEvents = await request(http)
        .get('/api/v1/public/masjids/masjid-content/events')
        .expect(200);
      expect(publicEvents.body.meta.total).toBe(1);
      expect(publicEvents.body.data[0].title).toBe('Community iftar');
    });

    it('rejects endsAt before startsAt', async () => {
      await request(http)
        .post(`/api/v1/masjids/${masjidAId}/events`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({ title: 'Broken', startsAt: '2099-08-15T18:30:00Z', endsAt: '2099-08-15T18:00:00Z' })
        .expect(400);
    });

    it('cancelled events disappear from the public feed', async () => {
      const list = await request(http)
        .get(`/api/v1/masjids/${masjidAId}/events`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .expect(200);
      const eventId = list.body.data[0].id as string;

      await request(http)
        .patch(`/api/v1/masjids/${masjidAId}/events/${eventId}`)
        .set('Authorization', `Bearer ${maintainerToken}`)
        .send({ status: 'CANCELLED' })
        .expect(200);

      const publicEvents = await request(http)
        .get('/api/v1/public/masjids/masjid-content/events')
        .expect(200);
      expect(publicEvents.body.meta.total).toBe(0);
    });
  });

  describe('public profile and visibility', () => {
    it('serves the public profile without internal fields', async () => {
      const res = await request(http).get('/api/v1/public/masjids/masjid-content').expect(200);
      expect(res.body.name).toBe('Masjid Content');
      expect(res.body.timezone).toBe('America/Toronto');
      expect(res.body).not.toHaveProperty('status');
      expect(res.body).not.toHaveProperty('createdAt');
    });

    it('serves public prayer times by slug', async () => {
      const res = await request(http)
        .get('/api/v1/public/masjids/masjid-content/prayer-times?from=2099-08-01&to=2099-08-31')
        .expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('suspended masjids vanish from the public API', async () => {
      await request(http)
        .patch(`/api/v1/masjids/${masjidAId}/status`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({ status: MasjidStatus.SUSPENDED })
        .expect(200);

      await request(http).get('/api/v1/public/masjids/masjid-content').expect(404);
      await request(http).get('/api/v1/public/masjids/masjid-content/prayer-times').expect(404);

      await request(http)
        .patch(`/api/v1/masjids/${masjidAId}/status`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({ status: MasjidStatus.ACTIVE })
        .expect(200);
      await request(http).get('/api/v1/public/masjids/masjid-content').expect(200);
    });

    it('404s for unknown slugs', async () => {
      await request(http).get('/api/v1/public/masjids/no-such-masjid').expect(404);
    });
  });
});
