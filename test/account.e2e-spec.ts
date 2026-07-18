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

const ADMIN = { email: 'account@e2e.local', password: 'original-password-123' };

describe('Account (profile + password) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

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
        email: ADMIN.email,
        passwordHash: await AuthService.hashPassword(ADMIN.password),
        firstName: 'Original',
        lastName: 'Name',
        role: UserRole.PLATFORM_ADMIN,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('updates own name via PATCH /auth/me and reflects it in GET /auth/me', async () => {
    const token = (await login(ADMIN).expect(200)).body.accessToken as string;

    const patched = await request(http)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Rameez', lastName: 'Handel' })
      .expect(200);
    expect(patched.body.firstName).toBe('Rameez');
    expect(patched.body.lastName).toBe('Handel');

    const me = await request(http)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.firstName).toBe('Rameez');
    expect(me.body.lastName).toBe('Handel');
  });

  it('rejects an empty name', async () => {
    const token = (await login(ADMIN).expect(200)).body.accessToken as string;
    await request(http)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: '' })
      .expect(400);
  });

  it('requires the correct current password to change it', async () => {
    const token = (await login(ADMIN).expect(200)).body.accessToken as string;
    await request(http)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong-password', newPassword: 'a-brand-new-password-123' })
      .expect(401);
  });

  it('enforces the minimum length on the new password', async () => {
    const token = (await login(ADMIN).expect(200)).body.accessToken as string;
    await request(http)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: ADMIN.password, newPassword: 'short' })
      .expect(400);
  });

  it('changes the password: old one stops working, new one logs in', async () => {
    const token = (await login(ADMIN).expect(200)).body.accessToken as string;
    const newPassword = 'a-brand-new-strong-password-123';

    await request(http)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: ADMIN.password, newPassword })
      .expect(204);

    await login(ADMIN).expect(401);
    await login({ email: ADMIN.email, password: newPassword }).expect(200);
  });
});
