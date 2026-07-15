import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationsController, MasjidInvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [AuthModule],
  controllers: [MasjidInvitationsController, InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
