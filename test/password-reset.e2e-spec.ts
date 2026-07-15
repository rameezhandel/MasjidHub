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
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';

const USER = { email: 'reset-me@reset-e2e.local', password: 'original-password-123' };

class MailCapture {
  emails: Array<{ to: string; resetUrl: string }> = [];

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    this.emails.push({ to, resetUrl });
  }

  lastToken(): string | undefined {
    const last = this.emails.at(-1);
    return last?.resetUrl.split('token=')[1];
  }
}

describe('Password reset flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const mail = new MailCapture();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    prisma = app.get(PrismaService);
    await prisma.passwordResetToken.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.announcement.deleteMany();
    await prisma.event.deleteMany();
    await prisma.prayerTimetableEntry.deleteMany();
    await prisma.user.deleteMany();
    await prisma.masjid.deleteMany();

    await prisma.user.create({
      data: {
        email: USER.email,
        passwordHash: await AuthService.hashPassword(USER.password),
        firstName: 'Reset',
        lastName: 'Me',
        role: UserRole.PLATFORM_ADMIN,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 204 for unknown emails without sending anything', async () => {
    await request(http)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@reset-e2e.local' })
      .expect(204);
    expect(mail.emails).toHaveLength(0);
  });

  it('sends a reset link for a known email', async () => {
    await request(http)
      .post('/api/v1/auth/forgot-password')
      .send({ email: USER.email })
      .expect(204);
    expect(mail.emails).toHaveLength(1);
    expect(mail.emails[0].to).toBe(USER.email);
    expect(mail.lastToken()).toBeTruthy();
  });

  it('a second request invalidates the first token', async () => {
    const firstToken = mail.lastToken() as string;
    await request(http)
      .post('/api/v1/auth/forgot-password')
      .send({ email: USER.email })
      .expect(204);
    expect(mail.emails).toHaveLength(2);

    await request(http)
      .post('/api/v1/auth/reset-password')
      .send({ token: firstToken, newPassword: 'should-not-work-123' })
      .expect(400);
  });

  it('rejects garbage tokens and weak passwords', async () => {
    await request(http)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'long-enough-password-1' })
      .expect(400);

    await request(http)
      .post('/api/v1/auth/reset-password')
      .send({ token: mail.lastToken(), newPassword: 'short' })
      .expect(400);
  });

  it('resets the password, revokes sessions, and consumes the token', async () => {
    // Open a session with the old password so we can prove it gets revoked.
    const session = await request(http).post('/api/v1/auth/login').send(USER).expect(200);
    const oldRefresh = session.body.refreshToken as string;

    const token = mail.lastToken() as string;
    const newPassword = 'brand-new-password-456';
    await request(http)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword })
      .expect(204);

    // Old credentials and old sessions are dead; new password works.
    await request(http).post('/api/v1/auth/login').send(USER).expect(401);
    await request(http).post('/api/v1/auth/refresh').send({ refreshToken: oldRefresh }).expect(401);
    await request(http)
      .post('/api/v1/auth/login')
      .send({ email: USER.email, password: newPassword })
      .expect(200);

    // Token is single-use.
    await request(http)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'yet-another-password-789' })
      .expect(400);
  });
});
