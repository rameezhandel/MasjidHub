import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@masjidhub.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'a-strong-password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
