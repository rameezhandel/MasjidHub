import { ApiProperty } from '@nestjs/swagger';
import { RelationshipType } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class CreateRelationshipDto {
  @ApiProperty({
    enum: RelationshipType,
    description:
      'PARENT links a parent (from) to a child (to); SPOUSE links two members (order is normalised).',
  })
  @IsEnum(RelationshipType)
  type!: RelationshipType;

  @ApiProperty({
    description: 'For PARENT, the parent member; for SPOUSE, one of the two members.',
  })
  @IsUUID()
  fromMemberId!: string;

  @ApiProperty({ description: 'For PARENT, the child member; for SPOUSE, the other member.' })
  @IsUUID()
  toMemberId!: string;
}
