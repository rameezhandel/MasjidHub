import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MasjidStatus, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { MasjidsService } from './masjids.service';

describe('MasjidsService', () => {
  let service: MasjidsService;

  const prisma = {
    masjid: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

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

  const masjid = (overrides: Record<string, unknown> = {}) => ({
    id: 'masjid-a',
    name: 'Masjid A',
    slug: 'masjid-a',
    status: MasjidStatus.ACTIVE,
    timezone: 'UTC',
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { users: 1 },
    ...overrides,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MasjidsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(MasjidsService);
  });

  describe('findOne', () => {
    it('lets a member read their own masjid', async () => {
      prisma.masjid.findUnique.mockResolvedValue(masjid());
      const result = await service.findOne('masjid-a', masjidAAdmin);
      expect(result.id).toBe('masjid-a');
    });

    it("blocks reading another tenant's masjid", async () => {
      await expect(service.findOne('masjid-b', masjidAAdmin)).rejects.toThrow(ForbiddenException);
      expect(prisma.masjid.findUnique).not.toHaveBeenCalled();
    });

    it('404s for the platform admin on a nonexistent masjid', async () => {
      prisma.masjid.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope', platformAdmin)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const dto = {
      name: 'Masjid Al-Noor',
      admin: {
        email: 'Imam@Al-Noor.org',
        firstName: 'Imam',
        lastName: 'Khan',
        password: 'long-enough-password',
      },
    };

    it('generates a slug from the name and lowercases the admin email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.masjid.findUnique.mockResolvedValue(null);
      prisma.masjid.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...masjid({ slug: data.slug, name: data.name }),
          users: [
            {
              id: 'u-1',
              email: 'imam@al-noor.org',
              passwordHash: 'hash',
              firstName: 'Imam',
              lastName: 'Khan',
              role: UserRole.MASJID_ADMIN,
              isActive: true,
              masjidId: 'masjid-a',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      );

      const result = await service.create(dto, platformAdmin);

      expect(result.slug).toBe('masjid-al-noor');
      expect(result.admin.email).toBe('imam@al-noor.org');
      expect(result.admin).not.toHaveProperty('passwordHash');
    });

    it('suffixes the slug when taken', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.masjid.findUnique
        .mockResolvedValueOnce(masjid()) // 'masjid-al-noor' taken
        .mockResolvedValueOnce(null); // 'masjid-al-noor-2' free
      prisma.masjid.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...masjid({ slug: data.slug }),
          users: [
            {
              id: 'u-1',
              email: 'imam@al-noor.org',
              passwordHash: 'hash',
              firstName: 'Imam',
              lastName: 'Khan',
              role: UserRole.MASJID_ADMIN,
              isActive: true,
              masjidId: 'masjid-a',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      );

      const result = await service.create({ ...dto, admin: { ...dto.admin } }, platformAdmin);
      expect(result.slug).toBe('masjid-al-noor-2');
    });

    it('rejects when the admin email is already in use', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create(dto, platformAdmin)).rejects.toThrow(ConflictException);
    });

    it('rejects an explicitly taken slug', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.masjid.findUnique.mockResolvedValue(masjid());
      await expect(service.create({ ...dto, slug: 'masjid-a' }, platformAdmin)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('setStatus', () => {
    it('suspending revokes all sessions of the masjid users', async () => {
      prisma.masjid.findUnique.mockResolvedValue(masjid());
      prisma.$transaction.mockResolvedValue([masjid({ status: MasjidStatus.SUSPENDED })]);

      const result = await service.setStatus('masjid-a', MasjidStatus.SUSPENDED, platformAdmin);

      expect(result.status).toBe(MasjidStatus.SUSPENDED);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user: { masjidId: 'masjid-a' }, revokedAt: null },
        }),
      );
    });

    it('is a no-op when the status is unchanged', async () => {
      prisma.masjid.findUnique.mockResolvedValue(masjid());
      const result = await service.setStatus('masjid-a', MasjidStatus.ACTIVE, platformAdmin);
      expect(result.status).toBe(MasjidStatus.ACTIVE);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('blocks a masjid admin updating another masjid', async () => {
      await expect(service.update('masjid-b', { name: 'X' }, masjidAAdmin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects changing to a taken slug', async () => {
      prisma.masjid.findUnique
        .mockResolvedValueOnce(masjid())
        .mockResolvedValueOnce(masjid({ id: 'other', slug: 'taken' }));
      await expect(service.update('masjid-a', { slug: 'taken' }, platformAdmin)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
