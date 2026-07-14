import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { SafeUser } from '../common/utils/safe-user';
import { CreateMasjidUserDto } from './dto/create-masjid-user.dto';
import { QueryMasjidUsersDto } from './dto/query-masjid-users.dto';
import { UpdateMasjidUserDto } from './dto/update-masjid-user.dto';
import { UsersService } from './users.service';

@ApiTags('masjid-users')
@ApiBearerAuth()
@Roles(UserRole.PLATFORM_ADMIN, UserRole.MASJID_ADMIN)
@Controller({ path: 'masjids/:masjidId/users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Add an admin or maintainer to a masjid' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Body() dto: CreateMasjidUserDto,
  ): Promise<SafeUser> {
    return this.usersService.create(user, masjidId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List a masjid's users" })
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Query() query: QueryMasjidUsersDto,
  ): Promise<PaginatedResult<SafeUser>> {
    return this.usersService.findAll(user, masjidId, query);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get a single masjid user' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<SafeUser> {
    return this.usersService.findOne(user, masjidId, userId);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Update a masjid user (name, role, active state)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMasjidUserDto,
  ): Promise<SafeUser> {
    return this.usersService.update(user, masjidId, userId, dto);
  }
}
