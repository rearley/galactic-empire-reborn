import { Module, OnModuleInit } from '@nestjs/common';
import { ShipStateService } from '../ship/ship-state.service';
import { ShipClassCacheService } from '../physics/ship-class-cache.service';
import { CommandRouterService } from './command-router.service';
import { rotateCommand } from './handlers/rotate.handler';
import { impulseCommand, ionTrailObserversFrom, setIonTrailObserverSource } from './handlers/impulse.handler';
import { ShieldHandlerService } from './handlers/shield.handler';
import { fluxCommand } from './handlers/flux.handler';
import { LockHandlerService } from './handlers/lock.handler';
import { WarpHandlerService } from './handlers/warp.handler';
import { ScanHandlerService } from './handlers/scan.handler';
import { ExitHandlerService } from './handlers/exit.handler';
import { ReportHandlerService } from './handlers/report.handler';
import { OrbitHandlerService } from './handlers/orbit.handler';
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
// Ship management handlers (013)
import { CloakHandlerService } from './handlers/cloak.handler';
import { MaintHandlerService } from './handlers/maint.handler';
import { TransferHandlerService } from './handlers/transfer.handler';
import { JettisonHandlerService } from './handlers/jettison.handler';
import { SetHandlerService } from './handlers/set.handler';
import { DestructHandlerService } from './handlers/destruct.handler';
import { AbortHandlerService } from './handlers/abort.handler';
import { AbandonHandlerService } from './handlers/abandon.handler';
import { ShipManagementTickService } from './ship-management-tick.service';
import { CLOAK_ENERGY_USE, loadCloakEnergyUse } from './cloak.config';
// Planet attack handlers (014)
import { AttackHandlerService } from './handlers/attack.handler';
import { PlnHandlerService } from './handlers/pln.handler';
import { PriceHandlerService } from './handlers/price.handler';
import { FIRETICKS, loadFireticks } from './attack.config';
// Navigation handlers (016)
import { NavHandlerService } from './handlers/nav.handler';
import { HelpHandlerService } from './handlers/help.handler';
import { ClsHandlerService } from './handlers/cls.handler';
import { SpyHandlerService } from './handlers/spy.handler';
// Mail inbox handlers (017)
import { MaiHandlerService } from './handlers/mai.handler';
import { ReaHandlerService } from './handlers/rea.handler';
import { DelHandlerService } from './handlers/del.handler';
// Ship purchase handler (021)
import { NewShipHandlerService } from './handlers/new-ship.handler';
// Team management handlers (018)
import { TeamModule } from '../team/team.module';
import { ShipModule } from '../ship/ship.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { GalaxyModule } from '../galaxy/galaxy.module';
import { PlanetModule } from '../planet/planet.module';
import { PhysicsModule } from '../physics/physics.module';
import { CombatModule } from '../combat/combat.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [ShipModule, PrismaModule, GalaxyModule, PlanetModule, PhysicsModule, CombatModule, OnboardingModule, MailModule, TeamModule],
  providers: [
    CommandRouterService,
    ScanHandlerService,
    ExitHandlerService,
    ReportHandlerService,
    OrbitHandlerService,
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
    ShieldHandlerService,
    RenameHandlerService,
    WhoHandlerService,
    DatHandlerService,
    RosHandlerService,
    SenHandlerService,
    FreHandlerService,
    TeaHandlerService,
    // Ship management handlers (013)
    CloakHandlerService,
    MaintHandlerService,
    TransferHandlerService,
    JettisonHandlerService,
    SetHandlerService,
    DestructHandlerService,
    AbortHandlerService,
    AbandonHandlerService,
    ShipManagementTickService,
    { provide: CLOAK_ENERGY_USE, useFactory: () => loadCloakEnergyUse() },
    // Planet attack handlers (014)
    AttackHandlerService,
    PlnHandlerService,
    PriceHandlerService,
    { provide: FIRETICKS, useFactory: () => loadFireticks() },
    // Navigation handlers (016)
    NavHandlerService,
    HelpHandlerService,
    ClsHandlerService,
    SpyHandlerService,
    // Mail inbox handlers (017)
    MaiHandlerService,
    ReaHandlerService,
    DelHandlerService,
    // Ship purchase handler (021)
    NewShipHandlerService,
  ],
  exports: [CommandRouterService, ScanHandlerService],
})
export class CommandsModule implements OnModuleInit {
  constructor(
    private readonly commandRouter: CommandRouterService,
    private readonly exitHandler: ExitHandlerService,
    private readonly scanHandler: ScanHandlerService,
    private readonly reportHandler: ReportHandlerService,
    private readonly orbitHandler: OrbitHandlerService,
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
    private readonly shieldHandler: ShieldHandlerService,
    private readonly renameHandler: RenameHandlerService,
    private readonly whoHandler: WhoHandlerService,
    private readonly datHandler: DatHandlerService,
    private readonly rosHandler: RosHandlerService,
    private readonly senHandler: SenHandlerService,
    private readonly freHandler: FreHandlerService,
    private readonly teaHandler: TeaHandlerService,
    private readonly cloakHandler: CloakHandlerService,
    private readonly maintHandler: MaintHandlerService,
    private readonly transferHandler: TransferHandlerService,
    private readonly jettisonHandler: JettisonHandlerService,
    private readonly setHandler: SetHandlerService,
    private readonly destructHandler: DestructHandlerService,
    private readonly abortHandler: AbortHandlerService,
    private readonly abandonHandler: AbandonHandlerService,
    // Planet attack handlers (014)
    private readonly attackHandler: AttackHandlerService,
    private readonly plnHandler: PlnHandlerService,
    private readonly priceHandler: PriceHandlerService,
    // Navigation handlers (016)
    private readonly navHandler: NavHandlerService,
    private readonly helpHandler: HelpHandlerService,
    private readonly clsHandler: ClsHandlerService,
    private readonly spyHandler: SpyHandlerService,
    // Mail inbox handlers (017)
    private readonly maiHandler: MaiHandlerService,
    private readonly reaHandler: ReaHandlerService,
    private readonly delHandler: DelHandlerService,
    // Ship purchase handler (021)
    private readonly newShipHandler: NewShipHandlerService,
    // For the CLOK3 observer sweep installed in onModuleInit.
    private readonly shipState: ShipStateService,
    private readonly shipClassCache: ShipClassCacheService,
  ) {}

  onModuleInit(): void {
    // CLOK3 — a cloaked ship opening the throttle leaks an ion trail. Canon
    // sweeps EVERY captain in the game, not the sector, and asks each one's own
    // class scan range (GECMDS.C:524-546), so the handler needs the live ship
    // map and the class table. `impulseCommand` is a plain Command literal with
    // no DI, which is why it takes its observers through this seam rather than
    // a constructor. Without this line the whole mechanic was dead code.
    setIonTrailObserverSource((mover) =>
      ionTrailObserversFrom(
        this.shipState.findAllShips(),
        (c) => this.shipClassCache.getScanRange(c),
        mover,
      ),
    );

    this.commandRouter.register(this.exitHandler.command);
    this.commandRouter.register(rotateCommand);
    this.commandRouter.register(impulseCommand);
    this.commandRouter.register(this.warpHandler.command);
    this.commandRouter.register(this.scanHandler.command);
    this.commandRouter.register(this.reportHandler.command);
    this.commandRouter.register(this.orbitHandler.command);
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
    this.commandRouter.register(this.shieldHandler.command);
    this.commandRouter.register(fluxCommand);
    this.commandRouter.register(this.whoHandler.command);
    this.commandRouter.register(this.datHandler.command);
    this.commandRouter.register(this.rosHandler.command);
    this.commandRouter.register(this.senHandler.command);
    this.commandRouter.register(this.freHandler.command);
    this.commandRouter.register(this.teaHandler.command);
    // Ship management commands (013)
    this.commandRouter.register(this.cloakHandler.command);
    // NOT registered: 'maint' collides with 'mai' under the original's 3-char
    // prefix match (GECMDS.C:249). The original table had only {"mai",
    // cmd_maint}. MaiHandlerService owns the 'mai' prefix and delegates to
    // MaintHandlerService whenever args are present, so maintenance stays
    // reachable as `mai <password>` exactly as it was in the original.
    // MaintHandlerService is still injected directly by the tick layer.
    this.commandRouter.register(this.transferHandler.command);
    this.commandRouter.register(this.jettisonHandler.command);
    this.commandRouter.register(this.setHandler.command);
    this.commandRouter.register(this.destructHandler.command);
    this.commandRouter.register(this.abortHandler.command);
    this.commandRouter.register(this.abandonHandler.command);
    // Planet attack commands (014)
    this.commandRouter.register(this.attackHandler.command);
    this.commandRouter.register(this.plnHandler.command);
    this.commandRouter.register(this.priceHandler.command);
    // Navigation commands (016)
    this.commandRouter.register(this.navHandler.command);
    this.commandRouter.register(this.helpHandler.command);
    this.commandRouter.register(this.clsHandler.command);
    this.commandRouter.register(this.spyHandler.command);
    // Mail inbox commands (017)
    this.commandRouter.register(this.maiHandler.command);
    this.commandRouter.register(this.reaHandler.command);
    this.commandRouter.register(this.delHandler.command);
    // Ship purchase command (021)
    this.commandRouter.register(this.newShipHandler.command);
  }
}
