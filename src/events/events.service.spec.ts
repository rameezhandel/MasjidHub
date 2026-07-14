import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MasjidStatus, UserRole } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

describe('EventsService', () => {
  let service: EventsService;

  const prisma = {
    masjid: { findUnique: jest.fn() },
    event: {
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

  const dto = {
    title: 'Community iftar',
    startsAt: '2026-08-15T18:30:00Z',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [EventsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(EventsService);
  });

  it('creates an event with the actor recorded', async () => {
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
    prisma.event.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'e-1', ...data }),
    );

    const result = await service.create(maintainer, 'masjid-a', dto);

    expect(result.createdById).toBe('maint-1');
    expect(result.status).toBe('DRAFT');
  });

  it('rejects endsAt at or before startsAt', async () => {
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
    await expect(
      service.create(maintainer, 'masjid-a', { ...dto, endsAt: '2026-08-15T18:30:00Z' }),
    ).rejects.toThrow(BadRequestException);
  });

  it("blocks creating events in another tenant's masjid", async () => {
    await expect(service.create(maintainer, 'masjid-b', dto)).rejects.toThrow(ForbiddenException);
  });

  it('validates time order against the existing event on partial update', async () => {
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
    prisma.event.findFirst.mockResolvedValue({
      id: 'e-1',
      masjidId: 'masjid-a',
      startsAt: new Date('2026-08-15T18:30:00Z'),
      endsAt: null,
    });
    await expect(
      service.update(maintainer, 'masjid-a', 'e-1', { endsAt: '2026-08-15T18:00:00Z' }),
    ).rejects.toThrow(BadRequestException);
  });
});
