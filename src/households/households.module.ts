import { Module } from '@nestjs/common';
import { HouseholdImportService } from './household-import.service';
import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';

@Module({
  controllers: [HouseholdsController],
  providers: [HouseholdsService, HouseholdImportService],
})
export class HouseholdsModule {}
