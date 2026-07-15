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

const PLATFORM_ADMIN = { email: 'platform@invite-e2e.local', password: 'platform-admin-pass-123' };
const ADMIN_A = { email: 'admin-a@invite-e2e.local', password: 'masjid-a-admin-pass-123' };
const ADMIN_B = { email: 'admin-b@invite-e2e.local', password: 'masjid-b-admin-pass-123' };
const INVITEE_EMAIL = 'invitee@invite-e2e.local';

class MailCapture {
  invites: Array<{ to: string; inviteUrl: string }> = [];

  async sendPasswordResetEmail(): Promise<void> {}

  async sendInvitationEmail(to: string, inviteUrl: string): Promise<void> {
    this.invites.push({ to, inviteUrl });
  }

  lastToken(): string | undefined {
    return this.invites.at(-1)?.inviteUrl.split('token=')[1];
  }
}

describe('Invitations & audit log (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const mail = new MailCapture();

  let platformToken: string;
  let adminAToken: string;
  let adminBToken: string;
  let masjidAId: string;

  const login = async (creds: { email: string; password: string }): Promise<string> => {
    const res = await request(http).post('/api/v1/auth/login').send(creds).expect(200);
    return res.body.accessToken as string;
  };

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
    await prisma.auditLog.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.passwordResetToken.deleteMany();
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
        name: 'Masjid Invite',
        admin: { ...ADMIN_A, firstName: 'Ahmed', lastName: 'Khan' },
      })
      .expect(201);
    masjidAId = masjidA.body.id;

    await request(http)
      .post('/api/v1/masjids')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Masjid Other Invite',
        admin: { ...ADMIN_B, firstName: 'Bilal', lastName: 'Omar' },
      })
      .expect(201);

    adminAToken = await login(ADMIN_A);
    adminBToken = await login(ADMIN_B);
  });

  afterAll(async () => {
    await app.close();
  });

  it('masjid admin invites a maintainer; cross-tenant invites are blocked', async () => {
    const res = await request(http)
      .post(`/api/v1/masjids/${masjidAId}/invitations`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        email: INVITEE_EMAIL,
        firstName: 'Musa',
        lastName: 'Ali',
        role: UserRole.MASJID_MAINTAINER,
      })
      .expect(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body).not.toHaveProperty('tokenHash');
    expect(mail.invites).toHaveLength(1);
    expect(mail.invites[0].to).toBe(INVITEE_EMAIL);

    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/invitations`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({
        email: 'other@invite-e2e.local',
        firstName: 'In',
        lastName: 'Truder',
        role: UserRole.MASJID_MAINTAINER,
      })
      .expect(403);
  });

  it('re-inviting the same email replaces the previous link', async () => {
    const firstToken = mail.lastToken() as string;
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/invitations`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        email: INVITEE_EMAIL,
        firstName: 'Musa',
        lastName: 'Ali',
        role: UserRole.MASJID_MAINTAINER,
      })
      .expect(201);
    expect(mail.invites).toHaveLength(2);

    await request(http)
      .post('/api/v1/invitations/accept')
      .send({ token: firstToken, password: 'a-strong-password-123' })
      .expect(400);
  });

  it('inviting an existing user fails with 409', async () => {
    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/invitations`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        email: ADMIN_A.email,
        firstName: 'Dup',
        lastName: 'User',
        role: UserRole.MASJID_ADMIN,
      })
      .expect(409);
  });

  it('accepting sets the password, creates the user, and logs them in', async () => {
    const token = mail.lastToken() as string;

    await request(http)
      .post('/api/v1/invitations/accept')
      .send({ token, password: 'short' })
      .expect(400);

    const res = await request(http)
      .post('/api/v1/invitations/accept')
      .send({ token, password: 'invitee-chosen-pass-123' })
      .expect(200);
    expect(res.body.user.email).toBe(INVITEE_EMAIL);
    expect(res.body.user.role).toBe('MASJID_MAINTAINER');
    expect(res.body.user.masjidId).toBe(masjidAId);

    // The session works immediately, scoped to the right masjid.
    await request(http)
      .get(`/api/v1/masjids/${masjidAId}`)
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);

    // Token is single-use.
    await request(http)
      .post('/api/v1/invitations/accept')
      .send({ token, password: 'another-pass-12345' })
      .expect(400);
  });

  it('lists invitations with status and revokes pending ones', async () => {
    const list = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/invitations`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(list.body.data[0].status).toBe('ACCEPTED');

    await request(http)
      .post(`/api/v1/masjids/${masjidAId}/invitations`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        email: 'revoke-me@invite-e2e.local',
        firstName: 'Re',
        lastName: 'Voke',
        role: UserRole.MASJID_MAINTAINER,
      })
      .expect(201);
    const pending = await request(http)
      .get(`/api/v1/masjids/${masjidAId}/invitations`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    const pendingInvite = pending.body.data.find(
      (inv: { status: string }) => inv.status === 'PENDING',
    );

    await request(http)
      .delete(`/api/v1/masjids/${masjidAId}/invitations/${pendingInvite.id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(204);

    const revokedToken = mail.lastToken() as string;
    await request(http)
      .post('/api/v1/invitations/accept')
      .send({ token: revokedToken, password: 'wont-work-anyway-123' })
      .expect(400);
  });

  it('platform admin can query the audit log; masjid admins cannot', async () => {
    const res = await request(http)
      .get('/api/v1/audit-logs?pageSize=50')
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);

    const actions = res.body.data.map((entry: { action: string }) => entry.action);
    expect(actions).toContain('MASJID_CREATED');
    expect(actions).toContain('INVITATION_CREATED');
    expect(actions).toContain('INVITATION_ACCEPTED');
    expect(actions).toContain('INVITATION_REVOKED');

    const filtered = await request(http)
      .get(`/api/v1/audit-logs?action=INVITATION_ACCEPTED&masjidId=${masjidAId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(filtered.body.meta.total).toBe(1);
    expect(filtered.body.data[0].actorEmail).toBe(INVITEE_EMAIL);

    await request(http)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(403);
  });
});
