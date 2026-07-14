import { ApiProperty } from '@nestjs/swagger';
import { MasjidStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMasjidStatusDto {
  @ApiProperty({ enum: MasjidStatus })
  @IsEnum(MasjidStatus)
  status!: MasjidStatus;
}
