import { Module } from '@nestjs/common';
import { HouseholdImportService } from './household-import.service';
import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';
import { MembersController } from './members.controller';

@Module({
  controllers: [HouseholdsController, MembersController],
  providers: [HouseholdsService, HouseholdImportService],
})
export class HouseholdsModule {}
