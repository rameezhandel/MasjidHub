import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Announcement,
  ContentStatus,
  Event,
  EventStatus,
  Masjid,
  MasjidStatus,
} from '@prisma/client';
import { PaginatedResult, PaginationQueryDto, paginated } from '../common/dto/pagination.dto';
import { PrayerTimesService, PrayerTimetableEntryView } from '../prayer-times/prayer-times.service';
import { QueryPrayerTimesDto } from '../prayer-times/dto/prayer-times.dto';
import { PrismaService } from '../prisma/prisma.service';

/** Fields of a masjid that are safe to expose without authentication. */
export type PublicMasjidProfile = Pick<
  Masjid,
  | 'id'
  | 'name'
  | 'slug'
  | 'email'
  | 'phone'
  | 'website'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
  | 'timezone'
  | 'latitude'
  | 'longitude'
>;

const PUBLIC_MASJID_SELECT = {
  id: true,
  name: true,
  slug: true,
  email: true,
  phone: true,
  website: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  timezone: true,
  latitude: true,
  longitude: true,
} as const;

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prayerTimesService: PrayerTimesService,
  ) {}

  async getMasjidProfile(slug: string): Promise<PublicMasjidProfile> {
    return this.getActiveMasjidOrThrow(slug);
  }

  /** Defaults to today onward when no range is given. */
  async getPrayerTimes(
    slug: string,
    query: QueryPrayerTimesDto,
  ): Promise<PrayerTimetableEntryView[]> {
    const masjid = await this.getActiveMasjidOrThrow(slug);
    const effectiveQuery: QueryPrayerTimesDto =
      query.from || query.to ? query : { from: new Date().toISOString().slice(0, 10) };
    return this.prayerTimesService.queryRange(masjid.id, effectiveQuery);
  }

  async getAnnouncements(
    slug: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Announcement>> {
    const masjid = await this.getActiveMasjidOrThrow(slug);
    const where = { masjidId: masjid.id, status: ContentStatus.PUBLISHED };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  /** Published upcoming events (past events are omitted). */
  async getEvents(slug: string, query: PaginationQueryDto): Promise<PaginatedResult<Event>> {
    const masjid = await this.getActiveMasjidOrThrow(slug);
    const where = {
      masjidId: masjid.id,
      status: EventStatus.PUBLISHED,
      OR: [{ startsAt: { gte: new Date() } }, { endsAt: { gte: new Date() } }],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.event.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  /** Suspended and archived masjids are invisible publicly (404, not 403). */
  private async getActiveMasjidOrThrow(slug: string): Promise<PublicMasjidProfile> {
    const masjid = await this.prisma.masjid.findFirst({
      where: { slug, status: MasjidStatus.ACTIVE },
      select: PUBLIC_MASJID_SELECT,
    });
    if (!masjid) {
      throw new NotFoundException('Masjid not found');
    }
    return masjid;
  }
}
