import { Module } from '@nestjs/common';
import { PrayerTimesModule } from '../prayer-times/prayer-times.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [PrayerTimesModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
