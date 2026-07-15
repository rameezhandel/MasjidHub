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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { AuthTokens } from '../auth/auth.service';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResult, PaginationQueryDto } from '../common/dto/pagination.dto';
import { AcceptInvitationDto, CreateInvitationDto } from './dto/invitation.dto';
import { InvitationView, InvitationsService } from './invitations.service';

@ApiTags('invitations')
@ApiBearerAuth()
@Roles(UserRole.PLATFORM_ADMIN, UserRole.MASJID_ADMIN)
@Controller({ path: 'masjids/:masjidId/invitations', version: '1' })
export class MasjidInvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  @ApiOperation({ summary: 'Invite a staff member by email — they set their own password' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationView> {
    return this.invitationsService.create(user, masjidId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List a masjid's invitations with their status" })
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<InvitationView>> {
    return this.invitationsService.findAll(user, masjidId, query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.invitationsService.revoke(user, masjidId, id);
  }
}

@ApiTags('invitations')
@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation: set a password and get logged in' })
  accept(@Body() dto: AcceptInvitationDto): Promise<AuthTokens> {
    return this.invitationsService.accept(dto.token, dto.password);
  }
}
