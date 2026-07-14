import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ContentStatus, MasjidStatus, UserRole } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AnnouncementsService } from './announcements.service';

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;

  const prisma = {
    masjid: { findUnique: jest.fn() },
    announcement: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const maintainer: AuthUser = {
    id: 'maint-1',
    email: 'maint@test.local',
    role: UserRole.MASJID_MAINTAINER,
    masjidId: 'masjid-a',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AnnouncementsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AnnouncementsService);
  });

  it('creates drafts without publishedAt', async () => {
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
    prisma.announcement.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'a-1', ...data }),
    );

    const result = await service.create(maintainer, 'masjid-a', { title: 'T', body: 'B' });

    expect(result.status).toBe(ContentStatus.DRAFT);
    expect(result.publishedAt).toBeNull();
  });

  it('stamps publishedAt when created as published', async () => {
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
    prisma.announcement.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'a-1', ...data }),
    );

    const result = await service.create(maintainer, 'masjid-a', {
      title: 'T',
      body: 'B',
      status: ContentStatus.PUBLISHED,
    });
    expect(result.publishedAt).toBeInstanceOf(Date);
  });

  it('sets publishedAt on first publish only', async () => {
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
    const firstPublish = new Date('2026-01-01T00:00:00Z');
    prisma.announcement.findFirst.mockResolvedValue({
      id: 'a-1',
      masjidId: 'masjid-a',
      publishedAt: firstPublish,
    });
    prisma.announcement.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'a-1', ...data }),
    );

    await service.update(maintainer, 'masjid-a', 'a-1', { status: ContentStatus.PUBLISHED });

    const updateData = prisma.announcement.update.mock.calls[0][0].data;
    expect(updateData.publishedAt).toBeUndefined();
  });

  it('blocks cross-tenant access', async () => {
    await expect(service.create(maintainer, 'masjid-b', { title: 'T', body: 'B' })).rejects.toThrow(
      ForbiddenException,
    );
  });
});
