import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { TENANT_ROLES, TenantRole } from '../../users/dto/create-masjid-user.dto';

export class CreateInvitationDto {
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

  @ApiProperty({ enum: [UserRole.MASJID_ADMIN, UserRole.MASJID_MAINTAINER] })
  @IsIn(TENANT_ROLES)
  role!: TenantRole;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'Invitation token from the emailed link' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, description: 'Password chosen by the invitee' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
