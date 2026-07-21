import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { ListPublicMasjidsDto } from './dto/list-public-masjids.dto';
import { PublicMasjidCard, PublicService } from './public.service';

/** Unauthenticated directory so visitors can find their masjid by name or city. */
@ApiTags('public')
@Public()
@Controller({ path: 'public/masjids', version: '1' })
export class PublicDirectoryController {
  constructor(private readonly publicService: PublicService) {}

  @Get()
  @ApiOperation({ summary: 'Directory of active masjids, searchable by name or city' })
  list(@Query() query: ListPublicMasjidsDto): Promise<PaginatedResult<PublicMasjidCard>> {
    return this.publicService.listActiveMasjids(query);
  }
}
