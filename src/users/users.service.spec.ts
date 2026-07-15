import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MasjidStatus, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    masjid: { findUnique: jest.fn() },
  };
  const authService = { revokeAllSessions: jest.fn() };

  const platformAdmin: AuthUser = {
    id: 'pa-1',
    email: 'pa@test.local',
    role: UserRole.PLATFORM_ADMIN,
    masjidId: null,
  };
  const masjidAAdmin: AuthUser = {
    id: 'a-admin',
    email: 'a@test.local',
    role: UserRole.MASJID_ADMIN,
    masjidId: 'masjid-a',
  };
  const maintainer: AuthUser = {
    id: 'a-maint',
    email: 'm@test.local',
    role: UserRole.MASJID_MAINTAINER,
    masjidId: 'masjid-a',
  };

  const dbUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'u-1',
    email: 'user@test.local',
    passwordHash: 'hash',
    firstName: 'A',
    lastName: 'B',
    role: UserRole.MASJID_ADMIN,
    isActive: true,
    masjidId: 'masjid-a',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: authService },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe('tenant isolation', () => {
    it("rejects a masjid admin managing another masjid's users", async () => {
      await expect(
        service.create(masjidAAdmin, 'masjid-b', {
          email: 'x@test.local',
          firstName: 'X',
          lastName: 'Y',
          password: 'long-enough-password',
          role: UserRole.MASJID_MAINTAINER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects maintainers entirely', async () => {
      await expect(service.findOne(maintainer, 'masjid-a', 'u-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows the platform admin on any masjid', async () => {
      prisma.user.findFirst.mockResolvedValue(dbUser());
      const result = await service.findOne(platformAdmin, 'masjid-a', 'u-1');
      expect(result.id).toBe('u-1');
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('create', () => {
    it('rejects duplicate emails', async () => {
      prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
      prisma.user.findUnique.mockResolvedValue(dbUser());
      await expect(
        service.create(masjidAAdmin, 'masjid-a', {
          email: 'user@test.local',
          firstName: 'X',
          lastName: 'Y',
          password: 'long-enough-password',
          role: UserRole.MASJID_MAINTAINER,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects adding users to an archived masjid', async () => {
      prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ARCHIVED });
      await expect(
        service.create(platformAdmin, 'masjid-a', {
          email: 'x@test.local',
          firstName: 'X',
          lastName: 'Y',
          password: 'long-enough-password',
          role: UserRole.MASJID_MAINTAINER,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('404s on a nonexistent masjid', async () => {
      prisma.masjid.findUnique.mockResolvedValue(null);
      await expect(
        service.create(platformAdmin, 'masjid-a', {
          email: 'x@test.local',
          firstName: 'X',
          lastName: 'Y',
          password: 'long-enough-password',
          role: UserRole.MASJID_MAINTAINER,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update — last admin protection', () => {
    it('blocks deactivating the last active admin', async () => {
      prisma.user.findFirst.mockResolvedValue(dbUser());
      prisma.user.count.mockResolvedValue(0);
      await expect(
        service.update(platformAdmin, 'masjid-a', 'u-1', { isActive: false }),
      ).rejects.toThrow(ConflictException);
    });

    it('blocks demoting the last active admin', async () => {
      prisma.user.findFirst.mockResolvedValue(dbUser());
      prisma.user.count.mockResolvedValue(0);
      await expect(
        service.update(platformAdmin, 'masjid-a', 'u-1', { role: UserRole.MASJID_MAINTAINER }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows deactivation when another active admin exists, revoking sessions', async () => {
      prisma.user.findFirst.mockResolvedValue(dbUser());
      prisma.user.count.mockResolvedValue(1);
      prisma.user.update.mockResolvedValue(dbUser({ isActive: false }));

      const result = await service.update(masjidAAdmin, 'masjid-a', 'u-1', { isActive: false });

      expect(result.isActive).toBe(false);
      expect(authService.revokeAllSessions).toHaveBeenCalledWith('u-1');
    });

    it('does not revoke sessions on a plain rename', async () => {
      prisma.user.findFirst.mockResolvedValue(dbUser());
      prisma.user.update.mockResolvedValue(dbUser({ firstName: 'New' }));

      await service.update(masjidAAdmin, 'masjid-a', 'u-1', { firstName: 'New' });

      expect(authService.revokeAllSessions).not.toHaveBeenCalled();
    });
  });
});
