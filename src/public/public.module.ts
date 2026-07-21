import { Module } from '@nestjs/common';
import { PrayerTimesModule } from '../prayer-times/prayer-times.module';
import { PublicController } from './public.controller';
import { PublicDirectoryController } from './public-directory.controller';
import { PublicService } from './public.service';

@Module({
  imports: [PrayerTimesModule],
  controllers: [PublicDirectoryController, PublicController],
  providers: [PublicService],
})
export class PublicModule {}
