import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MasjidStatus, Prisma, PrayerTimetableEntry } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { assertMasjidMember } from '../common/utils/tenant-access';
import { PrismaService } from '../prisma/prisma.service';
import { GeneratePrayerTimesDto } from './dto/generate-prayer-times.dto';
import { PrayerTimetableEntryDto, QueryPrayerTimesDto } from './dto/prayer-times.dto';
import { PrayerCalculationService } from './prayer-calculation.service';

/** API shape: `date` is a plain YYYY-MM-DD string, not a timestamp. */
export type PrayerTimetableEntryView = Omit<PrayerTimetableEntry, 'date'> & { date: string };

export function toEntryView(entry: PrayerTimetableEntry): PrayerTimetableEntryView {
  return { ...entry, date: entry.date.toISOString().slice(0, 10) };
}

@Injectable()
export class PrayerTimesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculation: PrayerCalculationService,
  ) {}

  /**
   * Computes the timetable from the masjid's coordinates and calculation
   * settings. Existing entries (e.g. manual uploads) are kept unless
   * `overwrite` is set — manual data wins by default.
   */
  async generate(
    actor: AuthUser,
    masjidId: string,
    dto: GeneratePrayerTimesDto,
  ): Promise<{ generated: number; skipped: number }> {
    assertMasjidMember(actor, masjidId);
    const masjid = await this.prisma.masjid.findUnique({ where: { id: masjidId } });
    if (!masjid) {
      throw new NotFoundException('Masjid not found');
    }
    if (masjid.status === MasjidStatus.ARCHIVED) {
      throw new ConflictException('Cannot modify content of an archived masjid');
    }
    if (masjid.latitude == null || masjid.longitude == null) {
      throw new ConflictException(
        'Set the masjid latitude and longitude before generating prayer times',
      );
    }
    if (dto.from > dto.to) {
      throw new BadRequestException('from must be on or before to');
    }
    const dates = this.calculation.enumerateDates(dto.from, dto.to);
    if (dates.length > 366) {
      throw new BadRequestException('Date range cannot exceed 366 days');
    }

    const config = {
      latitude: masjid.latitude,
      longitude: masjid.longitude,
      timezone: masjid.timezone,
      calculationMethod: masjid.calculationMethod,
      asrMethod: masjid.asrMethod,
    };
    const offsets = dto.iqamahOffsets;
    const rows = dates.map((date) => {
      const times = this.calculation.computeDay(config, date);
      const friday = this.calculation.isFriday(date);
      return {
        masjidId,
        date: new Date(date),
        fajr: times.fajr,
        fajrIqamah:
          offsets?.fajr != null ? this.calculation.addMinutes(times.fajr, offsets.fajr) : null,
        dhuhr: times.dhuhr,
        dhuhrIqamah:
          offsets?.dhuhr != null ? this.calculation.addMinutes(times.dhuhr, offsets.dhuhr) : null,
        asr: times.asr,
        asrIqamah:
          offsets?.asr != null ? this.calculation.addMinutes(times.asr, offsets.asr) : null,
        maghrib: times.maghrib,
        maghribIqamah:
          offsets?.maghrib != null
            ? this.calculation.addMinutes(times.maghrib, offsets.maghrib)
            : null,
        isha: times.isha,
        ishaIqamah:
          offsets?.isha != null ? this.calculation.addMinutes(times.isha, offsets.isha) : null,
        jumuah1: friday ? (dto.jumuah1 ?? null) : null,
        jumuah2: friday ? (dto.jumuah2 ?? null) : null,
      };
    });

    if (dto.overwrite) {
      await this.prisma.$transaction(
        rows.map(({ masjidId: rowMasjidId, date, ...times }) =>
          this.prisma.prayerTimetableEntry.upsert({
            where: { masjidId_date: { masjidId: rowMasjidId, date } },
            create: { masjidId: rowMasjidId, date, ...times },
            update: times,
          }),
        ),
      );
      return { generated: rows.length, skipped: 0 };
    }

    const result = await this.prisma.prayerTimetableEntry.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return { generated: result.count, skipped: rows.length - result.count };
  }

  async upsertMany(
    actor: AuthUser,
    masjidId: string,
    entries: PrayerTimetableEntryDto[],
  ): Promise<{ count: number }> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);

    const dates = entries.map((entry) => entry.date);
    if (new Set(dates).size !== dates.length) {
      throw new BadRequestException('Payload contains duplicate dates');
    }

    await this.prisma.$transaction(
      entries.map((entry) => {
        const { date, ...times } = entry;
        return this.prisma.prayerTimetableEntry.upsert({
          where: { masjidId_date: { masjidId, date: new Date(date) } },
          create: { masjidId, date: new Date(date), ...times },
          update: times,
        });
      }),
    );
    return { count: entries.length };
  }

  async findRange(
    actor: AuthUser,
    masjidId: string,
    query: QueryPrayerTimesDto,
  ): Promise<PrayerTimetableEntryView[]> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidExists(masjidId);
    return this.queryRange(masjidId, query);
  }

  /** Shared by the authenticated and public read paths. */
  async queryRange(
    masjidId: string,
    query: QueryPrayerTimesDto,
  ): Promise<PrayerTimetableEntryView[]> {
    const where: Prisma.PrayerTimetableEntryWhereInput = {
      masjidId,
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const entries = await this.prisma.prayerTimetableEntry.findMany({
      where,
      orderBy: { date: 'asc' },
      take: 400,
    });
    return entries.map(toEntryView);
  }

  async deleteOne(actor: AuthUser, masjidId: string, date: string): Promise<void> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    const { count } = await this.prisma.prayerTimetableEntry.deleteMany({
      where: { masjidId, date: new Date(date) },
    });
    if (count === 0) {
      throw new NotFoundException('No prayer timetable entry for this date');
    }
  }

  private async assertMasjidExists(masjidId: string): Promise<MasjidStatus> {
    const masjid = await this.prisma.masjid.findUnique({
      where: { id: masjidId },
      select: { status: true },
    });
    if (!masjid) {
      throw new NotFoundException('Masjid not found');
    }
    return masjid.status;
  }

  private async assertMasjidWritable(masjidId: string): Promise<void> {
    const status = await this.assertMasjidExists(masjidId);
    if (status === MasjidStatus.ARCHIVED) {
      throw new ConflictException('Cannot modify content of an archived masjid');
    }
  }
}
