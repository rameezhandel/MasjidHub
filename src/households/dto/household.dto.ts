import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { FeeFrequency, HouseholdStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CreateHouseholdMemberDto, DATE_PATTERN } from './household-member.dto';

export class CreateHouseholdDto {
  @ApiProperty({ example: 'Handel Family' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  familyName!: string;

  @ApiProperty({ example: 'Rameez Handel' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  headName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ enum: HouseholdStatus, default: HouseholdStatus.ACTIVE })
  @IsOptional()
  @IsEnum(HouseholdStatus)
  status?: HouseholdStatus;

  @ApiPropertyOptional({ description: 'Membership fee in minor units (cents). 0/null clears it.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  feeAmountCents?: number;

  @ApiPropertyOptional({ enum: FeeFrequency })
  @IsOptional()
  @IsEnum(FeeFrequency)
  feeFrequency?: FeeFrequency;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Date the fee starts accruing' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'feeStartOn must be a date in YYYY-MM-DD format' })
  feeStartOn?: string;

  @ApiPropertyOptional({ type: [CreateHouseholdMemberDto], description: 'Initial family members' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateHouseholdMemberDto)
  members?: CreateHouseholdMemberDto[];
}

export class UpdateHouseholdDto extends PartialType(
  OmitType(CreateHouseholdDto, ['members'] as const),
) {}

export class QueryHouseholdsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: HouseholdStatus })
  @IsOptional()
  @IsEnum(HouseholdStatus)
  status?: HouseholdStatus;

  @ApiPropertyOptional({ description: 'Matches family name, head name or city (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
