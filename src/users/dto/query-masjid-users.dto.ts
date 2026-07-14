import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { TENANT_ROLES, TenantRole } from './create-masjid-user.dto';

export class QueryMasjidUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TENANT_ROLES })
  @IsOptional()
  @IsIn(TENANT_ROLES)
  role?: TenantRole;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Matches name or email (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
