import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { ApplyFeeDto, QueryDuesDto } from './dto/dues.dto';
import { DuesTotals, HouseholdDuesRow, HouseholdsService } from './households.service';

/**
 * Collection view across the whole masjid. Per-household dues stay on the
 * households controller; this is the treasurer's one-place-to-look.
 */
@ApiTags('dues')
@ApiBearerAuth()
@Controller({ path: 'masjids/:masjidId/dues', version: '1' })
export class DuesController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Get()
  @ApiOperation({ summary: 'Fee and balance for every household, with masjid totals' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Query() query: QueryDuesDto,
  ): Promise<PaginatedResult<HouseholdDuesRow> & { totals: DuesTotals }> {
    return this.householdsService.duesList(user, masjidId, query);
  }

  @Post('fee')
  @ApiOperation({ summary: 'Apply one fee to every active household' })
  @ApiOkResponse({ description: 'How many households were updated and how many were left alone' })
  applyFee(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Body() dto: ApplyFeeDto,
  ): Promise<{ updated: number; skipped: number }> {
    return this.householdsService.applyFee(user, masjidId, dto);
  }

  @Get('export')
  @ApiOperation({ summary: 'Download the collection sheet as .xlsx' })
  async export(
    @CurrentUser() user: AuthUser,
    @Param('masjidId', ParseUUIDPipe) masjidId: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.householdsService.duesExport(user, masjidId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="masjidhub-dues.xlsx"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }
}
