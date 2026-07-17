import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MemberRelationship } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateRelationshipDto } from './dto/relationship.dto';
import { FamilyTree, RelationshipsService } from './relationships.service';

@ApiTags('relationships')
@ApiBearerAuth()
@Controller({ path: 'masjids/:masjidId', version: '1' })
export class RelationshipsController {
  constructor(private readonly relationshipsService: RelationshipsService) {}

  @Post('member-relationships')
  @ApiOperation({ summary: 'Link two members (PARENT or SPOUSE) for the family tree' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Body() dto: CreateRelationshipDto,
  ): Promise<MemberRelationship> {
    return this.relationshipsService.create(user, masjidId, dto);
  }

  @Delete('member-relationships/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member relationship' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.relationshipsService.remove(user, masjidId, id);
  }

  @Get('households/:householdId/tree')
  @ApiOperation({ summary: 'Family graph reachable from a household (across households)' })
  tree(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('householdId', ParseUUIDPipe) householdId: string,
  ): Promise<FamilyTree> {
    return this.relationshipsService.tree(user, masjidId, householdId);
  }
}
