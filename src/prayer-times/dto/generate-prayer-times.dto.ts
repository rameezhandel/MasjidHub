import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';
import { DATE_PATTERN, TIME_PATTERN } from './prayer-times.dto';

export class IqamahOffsetsDto {
  @ApiPropertyOptional({ example: 20, description: 'Minutes after adhan' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  fajr?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  dhuhr?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  asr?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  maghrib?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  isha?: number;
}

export class GeneratePrayerTimesDto {
  @ApiProperty({ example: '2026-08-01' })
  @Matches(DATE_PATTERN, { message: 'from must be a date in YYYY-MM-DD format' })
  from!: string;

  @ApiProperty({ example: '2026-08-31' })
  @Matches(DATE_PATTERN, { message: 'to must be a date in YYYY-MM-DD format' })
  to!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Replace dates that already have entries (manual uploads included)',
  })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;

  @ApiPropertyOptional({ type: IqamahOffsetsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IqamahOffsetsDto)
  iqamahOffsets?: IqamahOffsetsDto;

  @ApiPropertyOptional({ example: '13:30', description: "Fixed first jumu'ah time for Fridays" })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'jumuah1 must be a 24h time in HH:MM format' })
  jumuah1?: string;

  @ApiPropertyOptional({ example: '14:30', description: "Fixed second jumu'ah time for Fridays" })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'jumuah2 must be a 24h time in HH:MM format' })
  jumuah2?: string;
}
