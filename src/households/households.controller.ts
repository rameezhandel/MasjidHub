import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { CreateHouseholdMemberDto, UpdateHouseholdMemberDto } from './dto/household-member.dto';
import { CreateHouseholdDto, QueryHouseholdsDto, UpdateHouseholdDto } from './dto/household.dto';
import { CreatePaymentDto } from './dto/payment.dto';
import { HouseholdImportService, ImportResult } from './household-import.service';
import {
  DuesView,
  HouseholdMemberView,
  HouseholdView,
  HouseholdsService,
  PaymentView,
} from './households.service';

@ApiTags('households')
@ApiBearerAuth()
@Controller({ path: 'masjids/:masjidId/households', version: '1' })
export class HouseholdsController {
  constructor(
    private readonly householdsService: HouseholdsService,
    private readonly importService: HouseholdImportService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Register a household (optionally with initial members)' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Body() dto: CreateHouseholdDto,
  ): Promise<HouseholdView> {
    return this.householdsService.create(user, masjidId, dto);
  }

  @Get('import/template')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="households-import-template.xlsx"')
  @ApiOperation({ summary: 'Download the Excel import template' })
  async template(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.importService.buildTemplate(user, masjidId));
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Import households from an Excel .xlsx file (pass ?dryRun=true to preview)',
  })
  importFile(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRun?: string,
  ): Promise<ImportResult> {
    return this.importService.import(user, masjidId, file, dryRun === 'true');
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

  @Get(':id/dues')
  @ApiOperation({ summary: 'Fee status: expected, paid, balance and payment history' })
  dues(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DuesView> {
    return this.householdsService.dues(user, masjidId, id);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Record an offline fee payment for a household' })
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentView> {
    return this.householdsService.addPayment(user, masjidId, id, dto);
  }

  @Delete(':id/payments/:paymentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a recorded payment' })
  async removePayment(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<void> {
    await this.householdsService.removePayment(user, masjidId, id, paymentId);
  }
}
