import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'imam@al-noor.org' })
  @IsEmail()
  email!: string;
}
