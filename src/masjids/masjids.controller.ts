import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Masjid, UserRole } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { CreateMasjidDto } from './dto/create-masjid.dto';
import { QueryMasjidsDto } from './dto/query-masjids.dto';
import { UpdateMasjidStatusDto } from './dto/update-masjid-status.dto';
import { UpdateMasjidDto } from './dto/update-masjid.dto';
import { MasjidWithUserCount, MasjidsService } from './masjids.service';

@ApiTags('masjids')
@ApiBearerAuth()
@Controller({ path: 'masjids', version: '1' })
export class MasjidsController {
  constructor(private readonly masjidsService: MasjidsService) {}

  @Post()
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Onboard a new masjid with its initial admin (platform admin only)' })
  create(
    @Body() dto: CreateMasjidDto,
    @CurrentUser() user: AuthUser,
  ): ReturnType<MasjidsService['create']> {
    return this.masjidsService.create(dto, user);
  }

  @Get()
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'List all masjids (platform admin only)' })
  findAll(@Query() query: QueryMasjidsDto): Promise<PaginatedResult<MasjidWithUserCount>> {
    return this.masjidsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a masjid (platform admin: any; members: their own)' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<MasjidWithUserCount> {
    return this.masjidsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.MASJID_ADMIN)
  @ApiOperation({ summary: 'Update a masjid (platform admin: any; masjid admin: their own)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMasjidDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Masjid> {
    return this.masjidsService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Activate/suspend/archive a masjid (platform admin only)' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMasjidStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Masjid> {
    return this.masjidsService.setStatus(id, dto.status, user);
  }
}
