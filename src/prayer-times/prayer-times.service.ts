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
import { PrayerTimetableEntryDto, QueryPrayerTimesDto } from './dto/prayer-times.dto';

/** API shape: `date` is a plain YYYY-MM-DD string, not a timestamp. */
export type PrayerTimetableEntryView = Omit<PrayerTimetableEntry, 'date'> & { date: string };

export function toEntryView(entry: PrayerTimetableEntry): PrayerTimetableEntryView {
  return { ...entry, date: entry.date.toISOString().slice(0, 10) };
}

@Injectable()
export class PrayerTimesService {
  constructor(private readonly prisma: PrismaService) {}

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
