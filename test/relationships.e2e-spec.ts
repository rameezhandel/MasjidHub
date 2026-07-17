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

const PLATFORM_ADMIN = { email: 'platform@rel-e2e.local', password: 'platform-admin-pass-123' };
const ADMIN_A = { email: 'admin-a@rel-e2e.local', password: 'masjid-a-admin-pass-123' };
const ADMIN_B = { email: 'admin-b@rel-e2e.local', password: 'masjid-b-admin-pass-123' };

describe('Member relationships / family tree (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  let adminAToken: string;
  let adminBToken: string;
  let masjidAId: string;
  let masjidBId: string;

  // Members across two households in masjid A.
  let dad: string;
  let mom: string;
  let child: string;
  let grandchild: string; // lives in a second household
  let outsiderMember: string; // in masjid B

  const login = async (creds: { email: string; password: string }): Promise<string> => {
    const res = await request(http).post('/api/v1/auth/login').send(creds).expect(200);
    return res.body.accessToken as string;
  };

  const addMember = async (
    masjidId: string,
    householdId: string,
    token: string,
    first: string,
  ): Promise<string> => {
    const res = await request(http)
      .post(`/api/v1/masjids/${masjidId}/households/${householdId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: first, lastName: 'Handel' })
      .expect(201);
    return res.body.id as string;
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
      .send({ name: 'Rel Masjid A', admin: { ...ADMIN_A, firstName: 'Ahmed', lastName: 'Khan' } })
      .expect(201);
    masjidAId = masjidA.body.id;

    const masjidB = await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Rel Masjid B', admin: { ...ADMIN_B, firstName: 'Bilal', lastName: 'Omar' } })
      .expect(201);
    masjidBId = masjidB.body.id;

    adminAToken = await login(ADMIN_A);
    adminBToken = await login(ADMIN_B);

    const h1 = await request(http)
      .post(`/api/v1/masjids/${masjidAId}/households`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ familyName: 'Handel Family', headName: 'Rameez Handel' })
      .expect(201);
    const household1 = h1.body.id;

    const h2 = await request(http)
      .post(`/api/v1/masjids/${masjidAId}/households`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ familyName: 'Younger Handel Family', headName: 'Yusuf Handel' })
      .expect(201);
    const household2 = h2.body.id;

    dad = await addMember(masjidAId, household1, adminAToken, 'Rameez');
    mom = await addMember(masjidAId, household1, adminAToken, 'Aisha');
    child = await addMember(masjidAId, household1, adminAToken, 'Yusuf');
    grandchild = await addMember(masjidAId, household2, adminAToken, 'Zayd');

    const hb = await request(http)
      .post(`/api/v1/masjids/${masjidBId}/households`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ familyName: 'Other Family', headName: 'Bilal Omar' })
      .expect(201);
    outsiderMember = await addMember(masjidBId, hb.body.id, adminBToken, 'Omar');

    // household1 for the tree assertions later
    (globalThis as Record<string, unknown>).__household1 = household1;
  });

  afterAll(async () => {
    await app.close();
  });

  it('links parents to a child and marks spouses', async () => {
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/member-relationships`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ type: 'PARENT', fromMemberId: dad, toMemberId: child })
      .expect(201);
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/member-relationships`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ type: 'PARENT', fromMemberId: mom, toMemberId: child })
      .expect(201);
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/member-relationships`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ type: 'SPOUSE', fromMemberId: dad, toMemberId: mom })
      .expect(201);
    // The child (in household1) is a parent of the grandchild (in household2).
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/member-relationships`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ type: 'PARENT', fromMemberId: child, toMemberId: grandchild })
      .expect(201);
  });

  it('rejects self-links and cross-masjid members', async () => {
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/member-relationships`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ type: 'PARENT', fromMemberId: dad, toMemberId: dad })
      .expect(400);
    // Member from masjid B cannot be linked inside masjid A.
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/member-relationships`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ type: 'PARENT', fromMemberId: dad, toMemberId: outsiderMember })
      .expect(404);
  });

  it('prevents a parent cycle', async () => {
    // child is a descendant of dad; making child a parent of dad would cycle.
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/member-relationships`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ type: 'PARENT', fromMemberId: grandchild, toMemberId: dad })
      .expect(400);
  });

  it('builds a family tree spanning both households', async () => {
    const household1 = (globalThis as Record<string, unknown>).__household1 as string;
    const res = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/households/${household1}/tree`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    const ids = (res.body.nodes as { id: string }[]).map((n) => n.id).sort();
    expect(ids).toEqual([dad, mom, child, grandchild].sort());
    expect(res.body.edges).toHaveLength(4);
    expect(res.body.truncated).toBe(false);
    const householdNames = new Set(
      (res.body.nodes as { householdName: string }[]).map((n) => n.householdName),
    );
    expect(householdNames.size).toBe(2);
  });

  it('blocks cross-tenant relationship and tree access', async () => {
    const household1 = (globalThis as Record<string, unknown>).__household1 as string;
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/member-relationships`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ type: 'SPOUSE', fromMemberId: dad, toMemberId: mom })
      .expect(403);
    await request(http)
      .get(`/api/v1/masjids/${masjidAId}/households/${household1}/tree`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .expect(403);
  });

  it('removes a relationship', async () => {
    const rels = await prisma.memberRelationship.findMany({ where: { masjidId: masjidAId } });
    const spouse = rels.find((r) => r.type === 'SPOUSE')!;
    await request(http)
      .delete(`/api/v1/masjids/${masjidAId}/member-relationships/${spouse.id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(204);
    await request(http)
      .delete(`/api/v1/masjids/${masjidAId}/member-relationships/${spouse.id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);
  });
});
