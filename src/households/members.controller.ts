import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { QueryMembersDto } from './dto/member-search.dto';
import { HouseholdsService, MemberSearchView } from './households.service';

@ApiTags('households')
@ApiBearerAuth()
@Controller({ path: 'masjids/:masjidId/members', version: '1' })
export class MembersController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Get()
  @ApiOperation({ summary: 'Search members across all households in the masjid' })
  search(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Query() query: QueryMembersDto,
  ): Promise<PaginatedResult<MemberSearchView>> {
    return this.householdsService.searchMembers(user, masjidId, query);
  }
}
