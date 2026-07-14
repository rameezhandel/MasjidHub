import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Announcement, Event } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { PaginatedResult, PaginationQueryDto } from '../common/dto/pagination.dto';
import { QueryPrayerTimesDto } from '../prayer-times/dto/prayer-times.dto';
import { PrayerTimetableEntryView } from '../prayer-times/prayer-times.service';
import { PublicMasjidProfile, PublicService } from './public.service';

/**
 * Unauthenticated community-facing reads, addressed by masjid slug.
 * Only ACTIVE masjids and PUBLISHED content are visible here.
 */
@ApiTags('public')
@Public()
@Controller({ path: 'public/masjids/:slug', version: '1' })
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get()
  @ApiOperation({ summary: 'Public masjid profile by slug' })
  getProfile(@Param('slug') slug: string): Promise<PublicMasjidProfile> {
    return this.publicService.getMasjidProfile(slug);
  }

  @Get('prayer-times')
  @ApiOperation({ summary: 'Prayer timetable (defaults to today onward)' })
  getPrayerTimes(
    @Param('slug') slug: string,
    @Query() query: QueryPrayerTimesDto,
  ): Promise<PrayerTimetableEntryView[]> {
    return this.publicService.getPrayerTimes(slug, query);
  }

  @Get('announcements')
  @ApiOperation({ summary: 'Published announcements, newest first' })
  getAnnouncements(
    @Param('slug') slug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<Announcement>> {
    return this.publicService.getAnnouncements(slug, query);
  }

  @Get('events')
  @ApiOperation({ summary: 'Published upcoming events, soonest first' })
  getEvents(
    @Param('slug') slug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<Event>> {
    return this.publicService.getEvents(slug, query);
  }
}
