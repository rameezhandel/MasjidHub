import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Roles a masjid user can hold — the platform admin is never tenant-scoped. */
export const TENANT_ROLES = [UserRole.MASJID_ADMIN, UserRole.MASJID_MAINTAINER] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export class CreateMasjidUserDto {
  @ApiProperty({ example: 'volunteer@al-noor.org' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: TENANT_ROLES })
  @IsIn(TENANT_ROLES)
  role!: TenantRole;
}
