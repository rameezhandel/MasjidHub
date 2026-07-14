import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateMasjidAdminDto {
  @ApiProperty({ example: 'imam@al-noor.org' })
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

  @ApiProperty({ minLength: 12, maxLength: 128, description: 'Initial password for the admin' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class CreateMasjidDto {
  @ApiProperty({ example: 'Masjid Al-Noor' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    example: 'masjid-al-noor',
    description: 'URL-safe unique identifier; generated from the name when omitted',
  })
  @IsOptional()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must contain only lowercase letters, digits and single hyphens',
  })
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  @MaxLength(200)
  website?: string;

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

  @ApiPropertyOptional({ example: 'America/New_York', default: 'UTC' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiProperty({ type: CreateMasjidAdminDto, description: 'Initial admin for the masjid' })
  @ValidateNested()
  @Type(() => CreateMasjidAdminDto)
  admin!: CreateMasjidAdminDto;
}
