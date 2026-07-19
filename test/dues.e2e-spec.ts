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

const PLATFORM_ADMIN = { email: 'platform@dues-e2e.local', password: 'platform-admin-pass-123' };
const ADMIN_A = { email: 'admin-a@dues-e2e.local', password: 'masjid-a-admin-pass-123' };
const ADMIN_B = { email: 'admin-b@dues-e2e.local', password: 'masjid-b-admin-pass-123' };

describe('Household dues (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  let adminAToken: string;
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
    await prisma.householdPayment.deleteMany();
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
        name: 'Dues Masjid A',
        currency: 'GBP',
        admin: { ...ADMIN_A, firstName: 'Ahmed', lastName: 'Khan' },
      })
      .expect(201);
    masjidAId = masjidA.body.id;
    expect(masjidA.body.currency).toBe('GBP');

    await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Dues Masjid B', admin: { ...ADMIN_B, firstName: 'Bilal', lastName: 'Omar' } })
      .expect(201);

    adminAToken = await login(ADMIN_A);
    adminBToken = await login(ADMIN_B);

    const hh = await request(http)
      .post(`/api/v1/masjids/${masjidAId}/households`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ familyName: 'Handel Family', headName: 'Rameez Handel' })
      .expect(201);
    householdId = hh.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets a monthly fee on the household', async () => {
    const res = await request(http)
      .patch(`/api/v1/masjids/${masjidAId}/households/${householdId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ feeAmountCents: 5000, feeFrequency: 'MONTHLY', feeStartOn: '2026-01-01' })
      .expect(200);
    expect(res.body.feeAmountCents).toBe(5000);
    expect(res.body.feeFrequency).toBe('MONTHLY');
    expect(res.body.feeStartOn).toBe('2026-01-01');
  });

  it('starts with a balance and no payments', async () => {
    const res = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/households/${householdId}/dues`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(res.body.currency).toBe('GBP');
    expect(res.body.feeAmountCents).toBe(5000);
    expect(res.body.paidCents).toBe(0);
    // Fee started in the past, so something is owed and equals the expected total.
    expect(res.body.expectedCents).toBeGreaterThan(0);
    expect(res.body.balanceCents).toBe(res.body.expectedCents);
    expect(res.body.payments).toHaveLength(0);
  });

  it('records payments and reduces the balance', async () => {
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/households/${householdId}/payments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ amountCents: 5000, paidOn: '2026-02-01', method: 'Cash', periodLabel: 'Jan 2026' })
      .expect(201);
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/households/${householdId}/payments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ amountCents: 3000, paidOn: '2026-03-01' })
      .expect(201);

    const res = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/households/${householdId}/dues`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(res.body.paidCents).toBe(8000);
    expect(res.body.balanceCents).toBe(res.body.expectedCents - 8000);
    expect(res.body.payments).toHaveLength(2);
    // Newest first.
    expect(res.body.payments[0].paidOn).toBe('2026-03-01');
  });

  it('deletes a payment', async () => {
    const dues = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/households/${householdId}/dues`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    const paymentId = dues.body.payments[0].id;
    await request(http)
      .delete(`/api/v1/masjids/${masjidAId}/households/${householdId}/payments/${paymentId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(204);
    const after = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/households/${householdId}/dues`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(after.body.payments).toHaveLength(1);
  });

  it('blocks cross-tenant access to dues and payments', async () => {
    await request(http)
      .get(`/api/v1/masjids/${masjidAId}/households/${householdId}/dues`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .expect(403);
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/households/${householdId}/payments`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ amountCents: 100, paidOn: '2026-01-01' })
      .expect(403);
  });
});
