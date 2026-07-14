import { Module } from '@nestjs/common';
import { MasjidsController } from './masjids.controller';
import { MasjidsService } from './masjids.service';

@Module({
  controllers: [MasjidsController],
  providers: [MasjidsService],
  exports: [MasjidsService],
})
export class MasjidsModule {}
