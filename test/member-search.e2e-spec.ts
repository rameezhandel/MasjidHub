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

const PLATFORM_ADMIN = { email: 'platform@ms-e2e.local', password: 'platform-admin-pass-123' };
const ADMIN_A = { email: 'admin-a@ms-e2e.local', password: 'masjid-a-admin-pass-123' };
const ADMIN_B = { email: 'admin-b@ms-e2e.local', password: 'masjid-b-admin-pass-123' };

describe('Member search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  let adminAToken: string;
  let adminBToken: string;
  let masjidAId: string;

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
    await prisma.memberRelationship.deleteMany();
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
        name: 'Search Masjid A',
        admin: { ...ADMIN_A, firstName: 'Ahmed', lastName: 'Khan' },
      })
      .expect(201);
    masjidAId = masjidA.body.id;

    const masjidB = await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Search Masjid B',
        admin: { ...ADMIN_B, firstName: 'Bilal', lastName: 'Omar' },
      })
      .expect(201);
    const masjidBId = masjidB.body.id;

    adminAToken = await login(ADMIN_A);
    adminBToken = await login(ADMIN_B);

    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/households`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        familyName: 'Handel Family',
        headName: 'Rameez Handel',
        members: [
          { firstName: 'Rameez', lastName: 'Handel', phone: '+1-313-555-0100' },
          { firstName: 'Aisha', lastName: 'Handel', email: 'aisha@handel.example' },
        ],
      })
      .expect(201);
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/households`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        familyName: 'Siddiqui Family',
        headName: 'Omar Siddiqui',
        members: [{ firstName: 'Omar', lastName: 'Siddiqui' }],
      })
      .expect(201);

    // A member in masjid B that must never surface for masjid A.
    await request(http)
      .post(`/api/v1/masjids/${masjidBId}/households`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({
        familyName: 'Other Family',
        headName: 'Rameez Stranger',
        members: [{ firstName: 'Rameez', lastName: 'Stranger' }],
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('finds a member by full name and returns household context', async () => {
    const res = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/members?search=Rameez%20Handel`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].firstName).toBe('Rameez');
    expect(res.body.data[0].household.familyName).toBe('Handel Family');
  });

  it('matches on phone and email fragments', async () => {
    const byPhone = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/members?search=555-0100`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(byPhone.body.meta.total).toBe(1);
    expect(byPhone.body.data[0].firstName).toBe('Rameez');

    const byEmail = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/members?search=aisha@handel`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(byEmail.body.meta.total).toBe(1);
    expect(byEmail.body.data[0].firstName).toBe('Aisha');
  });

  it('returns all members when no search term is given', async () => {
    const res = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/members`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(res.body.meta.total).toBe(3);
  });

  it('never surfaces members from another masjid', async () => {
    const res = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/members?search=Rameez`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    // Only Rameez Handel — never Rameez Stranger from masjid B.
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].lastName).toBe('Handel');
  });

  it('blocks cross-tenant member search', async () => {
    await request(http)
      .get(`/api/v1/masjids/${masjidAId}/members`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .expect(403);
  });
});
