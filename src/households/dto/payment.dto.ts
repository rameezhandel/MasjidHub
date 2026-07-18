import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { DATE_PATTERN } from './household-member.dto';

export class CreatePaymentDto {
  @ApiProperty({ description: 'Amount received in minor units (cents)', example: 5000 })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountCents!: number;

  @ApiProperty({ example: '2026-07-15', description: 'Date the payment was received' })
  @Matches(DATE_PATTERN, { message: 'paidOn must be a date in YYYY-MM-DD format' })
  paidOn!: string;

  @ApiPropertyOptional({ example: 'Cash', description: 'How it was paid' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  method?: string;

  @ApiPropertyOptional({ example: 'Jan 2026', description: 'Period this payment covers' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  periodLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
