import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MasjidStatus, RelationshipType, UserRole } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { RelationshipsService } from './relationships.service';

describe('RelationshipsService', () => {
  let service: RelationshipsService;

  const prisma = {
    masjid: { findUnique: jest.fn() },
    household: { findFirst: jest.fn() },
    householdMember: { findFirst: jest.fn(), findMany: jest.fn() },
    memberRelationship: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const maintainer: AuthUser = {
    id: 'maint-1',
    email: 'maint@test.local',
    role: UserRole.MASJID_MAINTAINER,
    masjidId: 'masjid-a',
  };

  const activeMasjid = () =>
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
  const memberExists = () => prisma.householdMember.findFirst.mockResolvedValue({ id: 'ok' });

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [RelationshipsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(RelationshipsService);
  });

  describe('create', () => {
    it('blocks a member from another masjid', async () => {
      await expect(
        service.create(maintainer, 'masjid-b', {
          type: RelationshipType.PARENT,
          fromMemberId: 'a',
          toMemberId: 'b',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects self-links', async () => {
      activeMasjid();
      await expect(
        service.create(maintainer, 'masjid-a', {
          type: RelationshipType.SPOUSE,
          fromMemberId: 'a',
          toMemberId: 'a',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('404s when a member is not in the masjid', async () => {
      activeMasjid();
      prisma.householdMember.findFirst.mockResolvedValue(null);
      await expect(
        service.create(maintainer, 'masjid-a', {
          type: RelationshipType.PARENT,
          fromMemberId: 'a',
          toMemberId: 'b',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('normalises SPOUSE ids to a canonical order', async () => {
      activeMasjid();
      memberExists();
      prisma.memberRelationship.findFirst.mockResolvedValue(null);
      prisma.memberRelationship.create.mockImplementation(({ data }: { data: unknown }) => data);

      await service.create(maintainer, 'masjid-a', {
        type: RelationshipType.SPOUSE,
        fromMemberId: 'zzz',
        toMemberId: 'aaa',
      });

      const data = prisma.memberRelationship.create.mock.calls[0][0].data;
      expect(data.fromMemberId).toBe('aaa');
      expect(data.toMemberId).toBe('zzz');
    });

    it('is idempotent when the link already exists', async () => {
      activeMasjid();
      memberExists();
      prisma.memberRelationship.findMany.mockResolvedValue([]);
      const existing = { id: 'rel-1' };
      prisma.memberRelationship.findFirst.mockResolvedValue(existing);
      const result = await service.create(maintainer, 'masjid-a', {
        type: RelationshipType.PARENT,
        fromMemberId: 'a',
        toMemberId: 'b',
      });
      expect(result).toBe(existing);
      expect(prisma.memberRelationship.create).not.toHaveBeenCalled();
    });

    it('rejects a PARENT link that would create a cycle', async () => {
      activeMasjid();
      memberExists();
      // Existing: a is parent of b. Adding b parent of a must be rejected.
      prisma.memberRelationship.findMany.mockResolvedValue([
        { fromMemberId: 'a', toMemberId: 'b' },
      ]);
      await expect(
        service.create(maintainer, 'masjid-a', {
          type: RelationshipType.PARENT,
          fromMemberId: 'b',
          toMemberId: 'a',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows a valid PARENT link across generations', async () => {
      activeMasjid();
      memberExists();
      prisma.memberRelationship.findMany.mockResolvedValue([
        { fromMemberId: 'a', toMemberId: 'b' },
      ]);
      prisma.memberRelationship.findFirst.mockResolvedValue(null);
      prisma.memberRelationship.create.mockImplementation(({ data }: { data: unknown }) => data);
      const result = await service.create(maintainer, 'masjid-a', {
        type: RelationshipType.PARENT,
        fromMemberId: 'b',
        toMemberId: 'c',
      });
      expect(result).toMatchObject({ fromMemberId: 'b', toMemberId: 'c' });
    });
  });

  describe('remove', () => {
    it('404s when nothing was deleted', async () => {
      activeMasjid();
      prisma.memberRelationship.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove(maintainer, 'masjid-a', 'rel-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('tree', () => {
    it('walks the graph across households', async () => {
      prisma.household.findFirst.mockResolvedValue({ id: 'hh-1' });
      prisma.householdMember.findMany
        .mockResolvedValueOnce([{ id: 'a' }]) // seed members of hh-1
        .mockResolvedValueOnce([
          {
            id: 'a',
            firstName: 'A',
            lastName: 'X',
            gender: null,
            householdId: 'hh-1',
            household: { familyName: 'Fam1' },
          },
          {
            id: 'b',
            firstName: 'B',
            lastName: 'Y',
            gender: null,
            householdId: 'hh-2',
            household: { familyName: 'Fam2' },
          },
        ]);
      prisma.memberRelationship.findMany.mockResolvedValue([
        { id: 'rel-1', type: RelationshipType.PARENT, fromMemberId: 'a', toMemberId: 'b' },
      ]);

      const tree = await service.tree(maintainer, 'masjid-a', 'hh-1');
      expect(tree.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
      expect(tree.edges).toHaveLength(1);
      expect(tree.truncated).toBe(false);
      // node 'b' lives in a different household — cross-household genealogy.
      expect(tree.nodes.find((n) => n.id === 'b')?.householdName).toBe('Fam2');
    });

    it('blocks reading a tree in another masjid', async () => {
      await expect(service.tree(maintainer, 'masjid-b', 'hh-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
