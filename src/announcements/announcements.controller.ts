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
import { Announcement, UserRole } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { AnnouncementsService } from './announcements.service';
import {
  CreateAnnouncementDto,
  QueryAnnouncementsDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';

@ApiTags('announcements')
@ApiBearerAuth()
@Controller({ path: 'masjids/:masjidId/announcements', version: '1' })
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an announcement (draft by default)' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Body() dto: CreateAnnouncementDto,
  ): Promise<Announcement> {
    return this.announcementsService.create(user, masjidId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List a masjid's announcements (all statuses, members only)" })
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Query() query: QueryAnnouncementsDto,
  ): Promise<PaginatedResult<Announcement>> {
    return this.announcementsService.findAll(user, masjidId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one announcement' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Announcement> {
    return this.announcementsService.findOne(user, masjidId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an announcement; set status to publish/archive' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
  ): Promise<Announcement> {
    return this.announcementsService.update(user, masjidId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.MASJID_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete an announcement (admins only)' })
  async delete(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.announcementsService.delete(user, masjidId, id);
  }
}
