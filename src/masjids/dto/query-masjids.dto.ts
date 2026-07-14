import { ApiPropertyOptional } from '@nestjs/swagger';
import { MasjidStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class QueryMasjidsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches name, slug or city (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: MasjidStatus })
  @IsOptional()
  @IsEnum(MasjidStatus)
  status?: MasjidStatus;
}
