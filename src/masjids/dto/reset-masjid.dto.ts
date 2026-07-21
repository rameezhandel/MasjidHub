import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** Selects which of a masjid's data sets to wipe. Omitted flags default to false. */
export class ResetMasjidDto {
  @ApiPropertyOptional({ description: 'Delete all households (and their members, dues, tree links)' })
  @IsOptional()
  @IsBoolean()
  households?: boolean;

  @ApiPropertyOptional({ description: 'Delete all prayer timetable entries' })
  @IsOptional()
  @IsBoolean()
  prayerTimes?: boolean;

  @ApiPropertyOptional({ description: 'Delete all announcements' })
  @IsOptional()
  @IsBoolean()
  announcements?: boolean;

  @ApiPropertyOptional({ description: 'Delete all events' })
  @IsOptional()
  @IsBoolean()
  events?: boolean;
}

export interface ResetMasjidResult {
  households: number;
  prayerTimes: number;
  announcements: number;
  events: number;
}
