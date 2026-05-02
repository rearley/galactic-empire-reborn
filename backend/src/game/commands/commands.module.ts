import { Module, OnModuleInit } from '@nestjs/common';
import { CommandRouterService } from './command-router.service';
import { rotateCommand } from './handlers/rotate.handler';
import { impulseCommand } from './handlers/impulse.handler';
import { warpCommand } from './handlers/warp.handler';
import { ScanHandlerService } from './handlers/scan.handler';
import { ReportHandlerService } from './handlers/report.handler';
import { ShipModule } from '../ship/ship.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { GalaxyModule } from '../galaxy/galaxy.module';

@Module({
  imports: [ShipModule, PrismaModule, GalaxyModule],
  providers: [CommandRouterService, ScanHandlerService, ReportHandlerService],
  exports: [CommandRouterService],
})
export class CommandsModule implements OnModuleInit {
  constructor(
    private readonly commandRouter: CommandRouterService,
    private readonly scanHandler: ScanHandlerService,
    private readonly reportHandler: ReportHandlerService,
  ) {}

  onModuleInit(): void {
    this.commandRouter.register(rotateCommand);
    this.commandRouter.register(impulseCommand);
    this.commandRouter.register(warpCommand);
    this.commandRouter.register(this.scanHandler.command);
    this.commandRouter.register(this.reportHandler.command);
  }
}
