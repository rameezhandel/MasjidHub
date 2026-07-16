import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { CreateHouseholdMemberDto, UpdateHouseholdMemberDto } from './dto/household-member.dto';
import { CreateHouseholdDto, QueryHouseholdsDto, UpdateHouseholdDto } from './dto/household.dto';
import { HouseholdMemberView, HouseholdView, HouseholdsService } from './households.service';

@ApiTags('households')
@ApiBearerAuth()
@Controller({ path: 'masjids/:masjidId/households', version: '1' })
export class HouseholdsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Post()
  @ApiOperation({ summary: 'Register a household (optionally with initial members)' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Body() dto: CreateHouseholdDto,
  ): Promise<HouseholdView> {
    return this.householdsService.create(user, masjidId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List/search households (with member counts)' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Query() query: QueryHouseholdsDto,
  ): Promise<PaginatedResult<HouseholdView>> {
    return this.householdsService.findAll(user, masjidId, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Household/member census totals' })
  summary(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
  ): ReturnType<HouseholdsService['summary']> {
    return this.householdsService.summary(user, masjidId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a household with its members' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HouseholdView> {
    return this.householdsService.findOne(user, masjidId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update household details' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHouseholdDto,
  ): Promise<HouseholdView> {
    return this.householdsService.update(user, masjidId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.MASJID_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a household and its members (admins only)' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.householdsService.remove(user, masjidId, id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to a household' })
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateHouseholdMemberDto,
  ): Promise<HouseholdMemberView> {
    return this.householdsService.addMember(user, masjidId, id, dto);
  }

  @Patch(':id/members/:memberId')
  @ApiOperation({ summary: 'Update a household member' })
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateHouseholdMemberDto,
  ): Promise<HouseholdMemberView> {
    return this.householdsService.updateMember(user, masjidId, id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from a household' })
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    await this.householdsService.removeMember(user, masjidId, id, memberId);
  }
}
