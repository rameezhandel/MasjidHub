import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MasjidStatus, UserRole } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { PrayerCalculationService } from './prayer-calculation.service';
import { PrayerTimesService, toEntryView } from './prayer-times.service';

describe('PrayerTimesService', () => {
  let service: PrayerTimesService;

  const prisma = {
    masjid: { findUnique: jest.fn() },
    prayerTimetableEntry: {
      upsert: jest.fn(),
      findMany: jest.fn(),
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

  const entry = {
    date: '2026-08-01',
    fajr: '04:45',
    dhuhr: '13:10',
    asr: '17:05',
    maghrib: '20:32',
    isha: '22:05',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrayerTimesService,
        PrayerCalculationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(PrayerTimesService);
  });

  it('lets a maintainer upsert entries for their own masjid', async () => {
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
    prisma.$transaction.mockResolvedValue([]);

    const result = await service.upsertMany(maintainer, 'masjid-a', [entry]);

    expect(result.count).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('blocks upserts into another masjid', async () => {
    await expect(service.upsertMany(maintainer, 'masjid-b', [entry])).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects payloads with duplicate dates', async () => {
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
    await expect(service.upsertMany(maintainer, 'masjid-a', [entry, { ...entry }])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects writes to an archived masjid', async () => {
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ARCHIVED });
    await expect(service.upsertMany(maintainer, 'masjid-a', [entry])).rejects.toThrow(
      'archived masjid',
    );
  });

  it('404s when deleting a date with no entry', async () => {
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
    prisma.prayerTimetableEntry.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.deleteOne(maintainer, 'masjid-a', '2026-08-01')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('serializes dates as YYYY-MM-DD strings', () => {
    const view = toEntryView({
      id: 'x',
      masjidId: 'masjid-a',
      date: new Date('2026-08-01'),
      fajr: '04:45',
      fajrIqamah: null,
      dhuhr: '13:10',
      dhuhrIqamah: null,
      asr: '17:05',
      asrIqamah: null,
      maghrib: '20:32',
      maghribIqamah: null,
      isha: '22:05',
      ishaIqamah: null,
      jumuah1: null,
      jumuah2: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(view.date).toBe('2026-08-01');
  });
});
