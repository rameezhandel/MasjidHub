import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';

/** 24h wall-clock time in the masjid's local timezone. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const TIME_MESSAGE = 'must be a 24h time in HH:MM format';
const DATE_MESSAGE = 'must be a date in YYYY-MM-DD format';

export class PrayerTimetableEntryDto {
  @ApiProperty({ example: '2026-08-01' })
  @Matches(DATE_PATTERN, { message: `date ${DATE_MESSAGE}` })
  date!: string;

  @ApiProperty({ example: '04:45' })
  @Matches(TIME_PATTERN, { message: `fajr ${TIME_MESSAGE}` })
  fajr!: string;

  @ApiPropertyOptional({ example: '05:15' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: `fajrIqamah ${TIME_MESSAGE}` })
  fajrIqamah?: string;

  @ApiProperty({ example: '13:10' })
  @Matches(TIME_PATTERN, { message: `dhuhr ${TIME_MESSAGE}` })
  dhuhr!: string;

  @ApiPropertyOptional({ example: '13:30' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: `dhuhrIqamah ${TIME_MESSAGE}` })
  dhuhrIqamah?: string;

  @ApiProperty({ example: '17:05' })
  @Matches(TIME_PATTERN, { message: `asr ${TIME_MESSAGE}` })
  asr!: string;

  @ApiPropertyOptional({ example: '17:30' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: `asrIqamah ${TIME_MESSAGE}` })
  asrIqamah?: string;

  @ApiProperty({ example: '20:32' })
  @Matches(TIME_PATTERN, { message: `maghrib ${TIME_MESSAGE}` })
  maghrib!: string;

  @ApiPropertyOptional({ example: '20:37' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: `maghribIqamah ${TIME_MESSAGE}` })
  maghribIqamah?: string;

  @ApiProperty({ example: '22:05' })
  @Matches(TIME_PATTERN, { message: `isha ${TIME_MESSAGE}` })
  isha!: string;

  @ApiPropertyOptional({ example: '22:20' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: `ishaIqamah ${TIME_MESSAGE}` })
  ishaIqamah?: string;

  @ApiPropertyOptional({ example: '13:30', description: "First jumu'ah (Fridays)" })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: `jumuah1 ${TIME_MESSAGE}` })
  jumuah1?: string;

  @ApiPropertyOptional({ example: '14:30', description: "Second jumu'ah (Fridays)" })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: `jumuah2 ${TIME_MESSAGE}` })
  jumuah2?: string;
}

export class UpsertPrayerTimesDto {
  @ApiProperty({ type: [PrayerTimetableEntryDto], description: 'Up to a year at a time' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(366)
  @ValidateNested({ each: true })
  @Type(() => PrayerTimetableEntryDto)
  entries!: PrayerTimetableEntryDto[];
}

export class QueryPrayerTimesDto {
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: `from ${DATE_MESSAGE}` })
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: `to ${DATE_MESSAGE}` })
  to?: string;
}
