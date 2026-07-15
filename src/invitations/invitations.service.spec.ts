import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MasjidStatus, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationsService, toInvitationView } from './invitations.service';

describe('InvitationsService', () => {
  let service: InvitationsService;

  const prisma = {
    masjid: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    invitation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const mailService = { sendInvitationEmail: jest.fn() };
  const authService = { sessionFor: jest.fn() };
  const auditService = { record: jest.fn() };

  const masjidAdmin: AuthUser = {
    id: 'admin-1',
    email: 'admin@test.local',
    role: UserRole.MASJID_ADMIN,
    masjidId: 'masjid-a',
  };
  const maintainer: AuthUser = { ...masjidAdmin, id: 'maint-1', role: UserRole.MASJID_MAINTAINER };

  const dto = {
    email: 'New.Person@Test.Local',
    firstName: 'New',
    lastName: 'Person',
    role: UserRole.MASJID_MAINTAINER,
  };

  const storedInvitation = (overrides: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    email: 'new.person@test.local',
    firstName: 'New',
    lastName: 'Person',
    role: UserRole.MASJID_MAINTAINER,
    masjidId: 'masjid-a',
    invitedById: 'admin-1',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 86_400_000),
    acceptedAt: null,
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'INVITATION_TTL_DAYS'
                ? 7
                : key === 'APP_BASE_URL'
                  ? 'http://localhost:3000'
                  : undefined,
            ),
          },
        },
        { provide: MailService, useValue: mailService },
        { provide: AuthService, useValue: authService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();
    service = moduleRef.get(InvitationsService);
  });

  describe('create', () => {
    it('stores only a hash, lowercases the email, and emails the raw token', async () => {
      prisma.masjid.findUnique.mockResolvedValue({
        id: 'masjid-a',
        name: 'Masjid A',
        status: MasjidStatus.ACTIVE,
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitation.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(storedInvitation(data)),
      );
      prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));

      const result = await service.create(masjidAdmin, 'masjid-a', dto);

      expect(result.email).toBe('new.person@test.local');
      expect(result).not.toHaveProperty('tokenHash');

      const created = prisma.invitation.create.mock.calls[0][0].data;
      const [, inviteUrl] = mailService.sendInvitationEmail.mock.calls[0];
      const rawToken = (inviteUrl as string).split('token=')[1];
      expect(created.tokenHash).toBe(AuthService.hashToken(rawToken));
      expect(created.tokenHash).not.toBe(rawToken);
      // previous outstanding invitations for the email are replaced
      expect(prisma.invitation.deleteMany).toHaveBeenCalledWith({
        where: { email: 'new.person@test.local', acceptedAt: null },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'INVITATION_CREATED' }),
      );
    });

    it('rejects when the email already belongs to a user', async () => {
      prisma.masjid.findUnique.mockResolvedValue({ id: 'masjid-a', status: MasjidStatus.ACTIVE });
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create(masjidAdmin, 'masjid-a', dto)).rejects.toThrow(ConflictException);
    });

    it('rejects invitations for suspended masjids', async () => {
      prisma.masjid.findUnique.mockResolvedValue({
        id: 'masjid-a',
        status: MasjidStatus.SUSPENDED,
      });
      await expect(service.create(masjidAdmin, 'masjid-a', dto)).rejects.toThrow(ConflictException);
    });

    it('blocks maintainers and cross-tenant admins', async () => {
      await expect(service.create(maintainer, 'masjid-a', dto)).rejects.toThrow(ForbiddenException);
      await expect(service.create(masjidAdmin, 'masjid-b', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('accept', () => {
    it('creates the user, consumes the invitation, and returns a session', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...storedInvitation(),
        masjid: { id: 'masjid-a', status: MasjidStatus.ACTIVE },
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([
        { id: 'user-new', email: 'new.person@test.local', masjidId: 'masjid-a' },
        {},
      ]);
      authService.sessionFor.mockResolvedValue({ accessToken: 'jwt' });

      const result = await service.accept('raw-token', 'a-long-enough-password');

      expect(result).toEqual({ accessToken: 'jwt' });
      expect(authService.sessionFor).toHaveBeenCalledWith('user-new');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'INVITATION_ACCEPTED' }),
      );
    });

    it('rejects expired and already-accepted invitations', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...storedInvitation({ expiresAt: new Date(Date.now() - 1000) }),
        masjid: { status: MasjidStatus.ACTIVE },
      });
      await expect(service.accept('t', 'a-long-enough-password')).rejects.toThrow(
        BadRequestException,
      );

      prisma.invitation.findUnique.mockResolvedValue({
        ...storedInvitation({ acceptedAt: new Date() }),
        masjid: { status: MasjidStatus.ACTIVE },
      });
      await expect(service.accept('t', 'a-long-enough-password')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when the masjid is no longer active', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...storedInvitation(),
        masjid: { status: MasjidStatus.SUSPENDED },
      });
      await expect(service.accept('t', 'a-long-enough-password')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('revoke', () => {
    it('refuses to revoke an accepted invitation', async () => {
      prisma.invitation.findFirst.mockResolvedValue(storedInvitation({ acceptedAt: new Date() }));
      await expect(service.revoke(masjidAdmin, 'masjid-a', 'inv-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  it('computes invitation status', () => {
    expect(toInvitationView(storedInvitation()).status).toBe('PENDING');
    expect(toInvitationView(storedInvitation({ acceptedAt: new Date() })).status).toBe('ACCEPTED');
    expect(
      toInvitationView(storedInvitation({ expiresAt: new Date(Date.now() - 1000) })).status,
    ).toBe('EXPIRED');
  });
});
