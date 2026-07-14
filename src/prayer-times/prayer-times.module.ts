import { Module } from '@nestjs/common';
import { PrayerCalculationService } from './prayer-calculation.service';
import { PrayerTimesController } from './prayer-times.controller';
import { PrayerTimesService } from './prayer-times.service';

@Module({
  controllers: [PrayerTimesController],
  providers: [PrayerTimesService, PrayerCalculationService],
  exports: [PrayerTimesService],
})
export class PrayerTimesModule {}
