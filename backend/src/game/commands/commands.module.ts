import { Module, OnModuleInit } from '@nestjs/common';
import { CommandRouterService } from './command-router.service';
import { rotateCommand } from './handlers/rotate.handler';
import { impulseCommand } from './handlers/impulse.handler';
import { WarpHandlerService } from './handlers/warp.handler';
import { ScanHandlerService } from './handlers/scan.handler';
import { ReportHandlerService } from './handlers/report.handler';
import { OrbitHandlerService } from './handlers/orbit.handler';
import { LandHandlerService } from './handlers/land.handler';
import { BuyHandlerService } from './handlers/buy.handler';
import { SellHandlerService } from './handlers/sell.handler';
import { AdminHandlerService } from './handlers/admin.handler';
import { WithdrawHandlerService } from './handlers/withdraw.handler';
import { PhaserHandlerService } from './handlers/phaser.handler';
import { ShipModule } from '../ship/ship.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { GalaxyModule } from '../galaxy/galaxy.module';
import { PlanetModule } from '../planet/planet.module';
import { PhysicsModule } from '../physics/physics.module';
import { CombatModule } from '../combat/combat.module';

@Module({
  imports: [ShipModule, PrismaModule, GalaxyModule, PlanetModule, PhysicsModule, CombatModule],
  providers: [
    CommandRouterService,
    ScanHandlerService,
    ReportHandlerService,
    OrbitHandlerService,
    LandHandlerService,
    BuyHandlerService,
    SellHandlerService,
    AdminHandlerService,
    WithdrawHandlerService,
    WarpHandlerService,
    PhaserHandlerService,
  ],
  exports: [CommandRouterService],
})
export class CommandsModule implements OnModuleInit {
  constructor(
    private readonly commandRouter: CommandRouterService,
    private readonly scanHandler: ScanHandlerService,
    private readonly reportHandler: ReportHandlerService,
    private readonly orbitHandler: OrbitHandlerService,
    private readonly landHandler: LandHandlerService,
    private readonly buyHandler: BuyHandlerService,
    private readonly sellHandler: SellHandlerService,
    private readonly adminHandler: AdminHandlerService,
    private readonly withdrawHandler: WithdrawHandlerService,
    private readonly warpHandler: WarpHandlerService,
    private readonly phaserHandler: PhaserHandlerService,
  ) {}

  onModuleInit(): void {
    this.commandRouter.register(rotateCommand);
    this.commandRouter.register(impulseCommand);
    this.commandRouter.register(this.warpHandler.command);
    this.commandRouter.register(this.scanHandler.command);
    this.commandRouter.register(this.reportHandler.command);
    this.commandRouter.register(this.orbitHandler.command);
    this.commandRouter.register(this.landHandler.command);
    this.commandRouter.register(this.buyHandler.command);
    this.commandRouter.register(this.sellHandler.command);
    this.commandRouter.register(this.adminHandler.command);
    this.commandRouter.register(this.withdrawHandler.command);
    this.commandRouter.register(this.phaserHandler.command);
  }
}
