import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DatePathPipe } from './date-path.pipe';
import { GeneratePrayerTimesDto } from './dto/generate-prayer-times.dto';
import { QueryPrayerTimesDto, UpsertPrayerTimesDto } from './dto/prayer-times.dto';
import { PrayerTimesService, PrayerTimetableEntryView } from './prayer-times.service';

@ApiTags('prayer-times')
@ApiBearerAuth()
@Controller({ path: 'masjids/:masjidId/prayer-times', version: '1' })
export class PrayerTimesController {
  constructor(private readonly prayerTimesService: PrayerTimesService) {}

  @Put()
  @ApiOperation({ summary: "Bulk upsert a masjid's prayer timetable (idempotent, keyed by date)" })
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Body() dto: UpsertPrayerTimesDto,
  ): Promise<{ count: number }> {
    return this.prayerTimesService.upsertMany(user, masjidId, dto.entries);
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Auto-calculate the timetable from the masjid's coordinates and calculation method " +
      '(existing dates are kept unless overwrite=true)',
  })
  generate(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Body() dto: GeneratePrayerTimesDto,
  ): Promise<{ generated: number; skipped: number }> {
    return this.prayerTimesService.generate(user, masjidId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List prayer timetable entries, optionally by date range' })
  findRange(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Query() query: QueryPrayerTimesDto,
  ): Promise<PrayerTimetableEntryView[]> {
    return this.prayerTimesService.findRange(user, masjidId, query);
  }

  @Delete(':date')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the timetable entry for one date (YYYY-MM-DD)' })
  async deleteOne(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('date', DatePathPipe) date: string,
  ): Promise<void> {
    await this.prayerTimesService.deleteOne(user, masjidId, date);
  }
}
