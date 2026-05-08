import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ShipModule } from '../ship/ship.module';
import { MailInboxRepository } from './mail-inbox.repository';
import { MailInboxService } from './mail-inbox.service';

@Module({
  imports: [PrismaModule, ShipModule],
  providers: [MailInboxRepository, MailInboxService],
  exports: [MailInboxService],
})
export class MailModule {}
