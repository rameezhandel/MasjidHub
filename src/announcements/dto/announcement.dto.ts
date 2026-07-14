import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Ramadan timetable released' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'The full Ramadan timetable is now available…' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  body!: string;

  @ApiPropertyOptional({
    enum: [ContentStatus.DRAFT, ContentStatus.PUBLISHED],
    default: ContentStatus.DRAFT,
  })
  @IsOptional()
  @IsIn([ContentStatus.DRAFT, ContentStatus.PUBLISHED])
  status?: typeof ContentStatus.DRAFT | typeof ContentStatus.PUBLISHED;
}

export class UpdateAnnouncementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  body?: string;

  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}

export class QueryAnnouncementsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional({ description: 'Matches title or body (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
