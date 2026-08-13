import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeeFrequency } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { DATE_PATTERN } from './household-member.dto';

/** Which slice of the collection list to show. */
export const DUES_FILTERS = ['all', 'owing', 'settled', 'no-fee'] as const;
export type DuesFilter = (typeof DUES_FILTERS)[number];

export class QueryDuesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Match family name, head of household or city' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    enum: DUES_FILTERS,
    default: 'all',
    description: 'owing = balance above zero; no-fee = no fee configured yet',
  })
  @IsOptional()
  @IsIn(DUES_FILTERS)
  filter: DuesFilter = 'all';
}

export class ApplyFeeDto {
  @ApiProperty({ description: 'Fee per period in minor units (cents)', example: 50000 })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  feeAmountCents!: number;

  @ApiProperty({ enum: FeeFrequency })
  @IsEnum(FeeFrequency)
  feeFrequency!: FeeFrequency;

  @ApiProperty({ example: '2026-01-01', description: 'Date the fee starts accruing' })
  @Matches(DATE_PATTERN, { message: 'feeStartOn must be a date in YYYY-MM-DD format' })
  feeStartOn!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Only fill in households that have no fee yet, leaving existing fees untouched',
  })
  @IsOptional()
  @Type(() => Boolean)
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyWithoutFee = false;
}
