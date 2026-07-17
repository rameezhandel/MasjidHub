import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Gender, HouseholdStatus, MasjidStatus, UserRole } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdsService, toMemberView } from './households.service';

describe('HouseholdsService', () => {
  let service: HouseholdsService;

  const prisma = {
    masjid: { findUnique: jest.fn() },
    household: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    householdMember: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const maintainer: AuthUser = {
    id: 'maint-1',
    email: 'maint@test.local',
    role: UserRole.MASJID_MAINTAINER,
    masjidId: 'masjid-a',
  };

  const dto = { familyName: 'Handel Family', headName: 'Rameez Handel' };

  const household = (overrides: Record<string, unknown> = {}) => ({
    id: 'hh-1',
    masjidId: 'masjid-a',
    familyName: 'Handel Family',
    headName: 'Rameez Handel',
    status: HouseholdStatus.ACTIVE,
    members: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [HouseholdsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(HouseholdsService);
  });

  describe('create', () => {
    it('lets a maintainer register a household with members', async () => {
      prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
      prisma.household.create.mockResolvedValue(
        household({
          members: [
            {
              id: 'm-1',
              householdId: 'hh-1',
              firstName: 'Aisha',
              lastName: 'Handel',
              relationship: 'Spouse',
              gender: Gender.FEMALE,
              dateOfBirth: new Date('1990-05-15'),
              phone: null,
              email: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      );

      const result = await service.create(maintainer, 'masjid-a', {
        ...dto,
        members: [{ firstName: 'Aisha', lastName: 'Handel', dateOfBirth: '1990-05-15' }],
      });

      expect(result.members?.[0].dateOfBirth).toBe('1990-05-15');
      const data = prisma.household.create.mock.calls[0][0].data;
      expect(data.createdById).toBe('maint-1');
      expect(data.members.create).toHaveLength(1);
    });

    it('blocks registering into another masjid', async () => {
      await expect(service.create(maintainer, 'masjid-b', dto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects writes to an archived masjid', async () => {
      prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ARCHIVED });
      await expect(service.create(maintainer, 'masjid-a', dto)).rejects.toThrow(ConflictException);
    });

    it('404s on a nonexistent masjid', async () => {
      prisma.masjid.findUnique.mockResolvedValue(null);
      await expect(service.create(maintainer, 'masjid-a', dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('serializes member dates as YYYY-MM-DD', async () => {
      prisma.household.findFirst.mockResolvedValue(
        household({
          members: [
            {
              id: 'm-1',
              householdId: 'hh-1',
              firstName: 'Aisha',
              lastName: 'Handel',
              relationship: null,
              gender: null,
              dateOfBirth: new Date('1990-05-15'),
              phone: null,
              email: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      );
      const result = await service.findOne(maintainer, 'masjid-a', 'hh-1');
      expect(result.members?.[0].dateOfBirth).toBe('1990-05-15');
    });

    it('404s when the household is missing', async () => {
      prisma.household.findFirst.mockResolvedValue(null);
      await expect(service.findOne(maintainer, 'masjid-a', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it("blocks reading another tenant's household", async () => {
      await expect(service.findOne(maintainer, 'masjid-b', 'hh-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.household.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('members', () => {
    it('rejects adding a member to a household in another masjid (not found)', async () => {
      prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
      prisma.household.findFirst.mockResolvedValue(null);
      await expect(
        service.addMember(maintainer, 'masjid-a', 'hh-x', { firstName: 'A', lastName: 'B' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s updating a member not in the household', async () => {
      prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
      prisma.household.findFirst.mockResolvedValue(household());
      prisma.householdMember.findFirst.mockResolvedValue(null);
      await expect(
        service.updateMember(maintainer, 'masjid-a', 'hh-1', 'm-x', { firstName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchMembers', () => {
    it('returns matching members with household context', async () => {
      prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
      prisma.$transaction.mockResolvedValue([
        [
          {
            id: 'm-1',
            householdId: 'hh-1',
            firstName: 'Rameez',
            lastName: 'Handel',
            relationship: 'Head',
            gender: Gender.MALE,
            dateOfBirth: new Date('1985-01-02'),
            phone: '555',
            email: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            household: {
              id: 'hh-1',
              familyName: 'Handel Family',
              headName: 'Rameez Handel',
              status: HouseholdStatus.ACTIVE,
            },
          },
        ],
        1,
      ]);

      const result = await service.searchMembers(maintainer, 'masjid-a', {
        page: 1,
        pageSize: 20,
        skip: 0,
        search: 'Rameez Handel',
      });

      expect(result.meta.total).toBe(1);
      expect(result.data[0].dateOfBirth).toBe('1985-01-02');
      expect(result.data[0].household.familyName).toBe('Handel Family');
      // Each token becomes its own AND clause (so "Rameez Handel" narrows).
      const where = prisma.householdMember.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(2);
      expect(where.household).toEqual({ masjidId: 'masjid-a' });
    });

    it("blocks searching another tenant's members", async () => {
      await expect(
        service.searchMembers(maintainer, 'masjid-b', { page: 1, pageSize: 20, skip: 0 }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.householdMember.findMany).not.toHaveBeenCalled();
    });
  });

  describe('summary', () => {
    it('returns census totals', async () => {
      prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
      prisma.$transaction.mockResolvedValue([10, 8, 1, 1, 34]);
      const result = await service.summary(maintainer, 'masjid-a');
      expect(result).toEqual({ total: 10, active: 8, inactive: 1, movedOut: 1, members: 34 });
    });
  });

  it('toMemberView handles null dateOfBirth', () => {
    const view = toMemberView({
      id: 'm-1',
      householdId: 'hh-1',
      firstName: 'A',
      lastName: 'B',
      relationship: null,
      gender: null,
      dateOfBirth: null,
      phone: null,
      email: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(view.dateOfBirth).toBeNull();
  });
});
