import { Module, OnModuleInit } from '@nestjs/common';
import { CommandRouterService } from './command-router.service';
import { rotateCommand } from './handlers/rotate.handler';
import { impulseCommand } from './handlers/impulse.handler';
import { shieldCommand } from './handlers/shield.handler';
import { fluxCommand } from './handlers/flux.handler';
import { LockHandlerService } from './handlers/lock.handler';
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
import { TorpedoHandlerService } from './handlers/torpedo.handler';
import { MissileHandlerService } from './handlers/missile.handler';
import { MineHandlerService } from './handlers/mine.handler';
import { ZipperHandlerService } from './handlers/zipper.handler';
import { DecoyHandlerService } from './handlers/decoy.handler';
import { JammerHandlerService } from './handlers/jammer.handler';
import { SysHandlerService } from './handlers/sys.handler';
import { RenameHandlerService } from './handlers/rename.handler';
import { WhoHandlerService } from './handlers/who.handler';
import { DatHandlerService } from './handlers/dat.handler';
import { RosHandlerService } from './handlers/ros.handler';
import { SenHandlerService } from './handlers/sen.handler';
import { FreHandlerService } from './handlers/fre.handler';
import { TeaHandlerService } from './handlers/tea.handler';
import { ShipModule } from '../ship/ship.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { GalaxyModule } from '../galaxy/galaxy.module';
import { PlanetModule } from '../planet/planet.module';
import { PhysicsModule } from '../physics/physics.module';
import { CombatModule } from '../combat/combat.module';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports: [ShipModule, PrismaModule, GalaxyModule, PlanetModule, PhysicsModule, CombatModule, OnboardingModule],
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
    TorpedoHandlerService,
    MissileHandlerService,
    MineHandlerService,
    ZipperHandlerService,
    DecoyHandlerService,
    JammerHandlerService,
    SysHandlerService,
    LockHandlerService,
    RenameHandlerService,
    WhoHandlerService,
    DatHandlerService,
    RosHandlerService,
    SenHandlerService,
    FreHandlerService,
    TeaHandlerService,
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
    private readonly torpedoHandler: TorpedoHandlerService,
    private readonly missileHandler: MissileHandlerService,
    private readonly mineHandler: MineHandlerService,
    private readonly zipperHandler: ZipperHandlerService,
    private readonly decoyHandler: DecoyHandlerService,
    private readonly jammerHandler: JammerHandlerService,
    private readonly sysHandler: SysHandlerService,
    private readonly lockHandler: LockHandlerService,
    private readonly renameHandler: RenameHandlerService,
    private readonly whoHandler: WhoHandlerService,
    private readonly datHandler: DatHandlerService,
    private readonly rosHandler: RosHandlerService,
    private readonly senHandler: SenHandlerService,
    private readonly freHandler: FreHandlerService,
    private readonly teaHandler: TeaHandlerService,
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
    this.commandRouter.register(this.torpedoHandler.command);
    this.commandRouter.register(this.missileHandler.command);
    this.commandRouter.register(this.mineHandler.command);
    this.commandRouter.register(this.zipperHandler.command);
    this.commandRouter.register(this.decoyHandler.command);
    this.commandRouter.register(this.jammerHandler.command);
    this.commandRouter.register(this.sysHandler.command);
    this.commandRouter.register(this.lockHandler.command);
    this.commandRouter.register(this.renameHandler.command);
    this.commandRouter.register(shieldCommand);
    this.commandRouter.register(fluxCommand);
    this.commandRouter.register(this.whoHandler.command);
    this.commandRouter.register(this.datHandler.command);
    this.commandRouter.register(this.rosHandler.command);
    this.commandRouter.register(this.senHandler.command);
    this.commandRouter.register(this.freHandler.command);
    this.commandRouter.register(this.teaHandler.command);
  }
}
