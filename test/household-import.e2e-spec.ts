process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret-with-enough-length-000000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/masjidhub_test';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const PLATFORM_ADMIN = { email: 'platform@hhimp-e2e.local', password: 'platform-admin-pass-123' };
const ADMIN = { email: 'admin@hhimp-e2e.local', password: 'masjid-admin-pass-123' };

const HEADERS = [
  'Family Name',
  'Head Name',
  'Phone',
  'City',
  'Status',
  'Member First Name',
  'Member Last Name',
  'Relationship',
  'Gender',
  'Date of Birth',
];

async function buildXlsx(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(HEADERS);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Household Excel import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let token: string;
  let masjidId: string;

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
    const platformRes = await request(http)
      .post('/api/v1/auth/login')
      .send(PLATFORM_ADMIN)
      .expect(200);
    const masjid = await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformRes.body.accessToken}`)
      .send({ name: 'Masjid Import', admin: { ...ADMIN, firstName: 'Ahmed', lastName: 'Khan' } })
      .expect(201);
    masjidId = masjid.body.id;
    const adminRes = await request(http).post('/api/v1/auth/login').send(ADMIN).expect(200);
    token = adminRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a downloadable .xlsx template', async () => {
    const res = await request(http)
      .get(`/api/v1/masjids/${masjidId}/households/import/template`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer);
    expect(wb.getWorksheet('Households')).toBeDefined();
  });

  it('previews an import with dry-run without writing', async () => {
    const buffer = await buildXlsx([
      [
        'Handel Family',
        'Rameez Handel',
        '+1-416-555-0100',
        'Toronto',
        'ACTIVE',
        'Rameez',
        'Handel',
        'Head',
        'Male',
        '1985-04-12',
      ],
      [
        'Handel Family',
        'Rameez Handel',
        '',
        '',
        '',
        'Aisha',
        'Handel',
        'Spouse',
        'Female',
        '1988-09-30',
      ],
      ['Omar Family', 'Bilal Omar', '', 'Chicago', '', 'Bilal', 'Omar', 'Head', 'Male', ''],
    ]);
    const res = await request(http)
      .post(`/api/v1/masjids/${masjidId}/households/import?dryRun=true`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'households.xlsx')
      .expect(201);
    expect(res.body).toEqual({
      dryRun: true,
      imported: false,
      households: 2,
      members: 3,
      errors: [],
    });

    const list = await request(http)
      .get(`/api/v1/masjids/${masjidId}/households`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.meta.total).toBe(0);
  });

  it('commits the import and creates households with members', async () => {
    const buffer = await buildXlsx([
      [
        'Handel Family',
        'Rameez Handel',
        '+1-416-555-0100',
        'Toronto',
        'ACTIVE',
        'Rameez',
        'Handel',
        'Head',
        'Male',
        '1985-04-12',
      ],
      [
        'Handel Family',
        'Rameez Handel',
        '',
        '',
        '',
        'Aisha',
        'Handel',
        'Spouse',
        'Female',
        '1988-09-30',
      ],
      ['Omar Family', 'Bilal Omar', '', 'Chicago', 'INACTIVE', 'Bilal', 'Omar', 'Head', 'Male', ''],
    ]);
    const res = await request(http)
      .post(`/api/v1/masjids/${masjidId}/households/import`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'households.xlsx')
      .expect(201);
    expect(res.body).toEqual({
      dryRun: false,
      imported: true,
      households: 2,
      members: 3,
      errors: [],
    });

    const summary = await request(http)
      .get(`/api/v1/masjids/${masjidId}/households/summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(summary.body).toEqual({ total: 2, active: 1, inactive: 1, movedOut: 0, members: 3 });

    // The Handel household kept its two members and its date-of-birth round-tripped.
    const list = await request(http)
      .get(`/api/v1/masjids/${masjidId}/households?search=handel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const detail = await request(http)
      .get(`/api/v1/masjids/${masjidId}/households/${list.body.data[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.members).toHaveLength(2);
    expect(
      detail.body.members.find((m: { firstName: string }) => m.firstName === 'Aisha').dateOfBirth,
    ).toBe('1988-09-30');
  });

  it('reports row errors and writes nothing on a bad sheet', async () => {
    const buffer = await buildXlsx([
      ['', 'Missing Family', '', '', '', 'X', 'Y', '', '', ''],
      ['Bad Family', 'Head', '', '', 'NONSENSE', 'A', 'B', '', 'Alien', 'not-a-date'],
    ]);
    const res = await request(http)
      .post(`/api/v1/masjids/${masjidId}/households/import`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'households.xlsx')
      .expect(201);
    expect(res.body.imported).toBe(false);
    expect(res.body.households).toBe(0);
    expect(res.body.errors.length).toBe(2);
  });
});
