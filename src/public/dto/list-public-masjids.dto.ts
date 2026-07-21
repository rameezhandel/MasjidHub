import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListPublicMasjidsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by name or city (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
