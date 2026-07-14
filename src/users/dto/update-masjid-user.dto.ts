import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TENANT_ROLES, TenantRole } from './create-masjid-user.dto';

export class UpdateMasjidUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ enum: TENANT_ROLES })
  @IsOptional()
  @IsIn(TENANT_ROLES)
  role?: TenantRole;

  @ApiPropertyOptional({ description: 'Set false to deactivate (blocks login immediately)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
