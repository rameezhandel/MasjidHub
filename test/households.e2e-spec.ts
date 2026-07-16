process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret-with-enough-length-000000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/masjidhub_test';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const PLATFORM_ADMIN = { email: 'platform@hh-e2e.local', password: 'platform-admin-pass-123' };
const ADMIN_A = { email: 'admin-a@hh-e2e.local', password: 'masjid-a-admin-pass-123' };
const MAINTAINER_A = { email: 'maint-a@hh-e2e.local', password: 'maintainer-a-pass-123' };
const ADMIN_B = { email: 'admin-b@hh-e2e.local', password: 'masjid-b-admin-pass-123' };

describe('Households (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  let adminAToken: string;
  let maintainerToken: string;
  let adminBToken: string;
  let masjidAId: string;
  let householdId: string;

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
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
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
    const platformToken = await login(PLATFORM_ADMIN);

    const masjidA = await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Masjid Households',
        admin: { ...ADMIN_A, firstName: 'Ahmed', lastName: 'Khan' },
      })
      .expect(201);
    masjidAId = masjidA.body.id;

    await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Masjid Other HH',
        admin: { ...ADMIN_B, firstName: 'Bilal', lastName: 'Omar' },
      })
      .expect(201);

    adminAToken = await login(ADMIN_A);
    adminBToken = await login(ADMIN_B);
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('a maintainer registers a household with members', async () => {
    const res = await request(http)
      .post(`/api/v1/masjids/${masjidAId}/households`)
      .set('Authorization', `Bearer ${maintainerToken}`)
      .send({
        familyName: 'Handel Family',
        headName: 'Rameez Handel',
        phone: '+1-313-555-0100',
        city: 'Dearborn',
        members: [
          { firstName: 'Rameez', lastName: 'Handel', relationship: 'Head', gender: 'MALE' },
          {
            firstName: 'Aisha',
            lastName: 'Handel',
            relationship: 'Spouse',
            gender: 'FEMALE',
            dateOfBirth: '1990-05-15',
          },
        ],
      })
      .expect(201);
    householdId = res.body.id;
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.members).toHaveLength(2);
    expect(res.body.members[1].dateOfBirth).toBe('1990-05-15');
  });

  it('lists households with member counts and supports search', async () => {
    const list = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/households?search=handel`)
      .set('Authorization', `Bearer ${maintainerToken}`)
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]._count.members).toBe(2);
  });

  it('reports census totals', async () => {
    const res = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/households/summary`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(res.body).toEqual({ total: 1, active: 1, inactive: 0, movedOut: 0, members: 2 });
  });

  it('adds, updates, and removes a member', async () => {
    const added = await request(http)
      .post(`/api/v1/masjids/${masjidAId}/households/${householdId}/members`)
      .set('Authorization', `Bearer ${maintainerToken}`)
      .send({ firstName: 'Yusuf', lastName: 'Handel', relationship: 'Son' })
      .expect(201);
    const memberId = added.body.id;

    await request(http)
      .patch(`/api/v1/masjids/${masjidAId}/households/${householdId}/members/${memberId}`)
      .set('Authorization', `Bearer ${maintainerToken}`)
      .send({ dateOfBirth: '2015-03-01' })
      .expect(200)
      .expect((r) => expect(r.body.dateOfBirth).toBe('2015-03-01'));

    await request(http)
      .delete(`/api/v1/masjids/${masjidAId}/households/${householdId}/members/${memberId}`)
      .set('Authorization', `Bearer ${maintainerToken}`)
      .expect(204);
  });

  it('updates the household status', async () => {
    await request(http)
      .patch(`/api/v1/masjids/${masjidAId}/households/${householdId}`)
      .set('Authorization', `Bearer ${maintainerToken}`)
      .send({ status: 'MOVED_OUT', notes: 'Relocated to another city' })
      .expect(200)
      .expect((r) => expect(r.body.status).toBe('MOVED_OUT'));
  });

  it('blocks cross-tenant access to households', async () => {
    await request(http)
      .get(`/api/v1/masjids/${masjidAId}/households`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .expect(403);
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/households`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ familyName: 'Intruder', headName: 'Nope' })
      .expect(403);
  });

  it('maintainers cannot delete a household; admins can', async () => {
    await request(http)
      .delete(`/api/v1/masjids/${masjidAId}/households/${householdId}`)
      .set('Authorization', `Bearer ${maintainerToken}`)
      .expect(403);

    await request(http)
      .delete(`/api/v1/masjids/${masjidAId}/households/${householdId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(204);

    await request(http)
      .get(`/api/v1/masjids/${masjidAId}/households/${householdId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);
  });
});
