import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Random } from '../combat/random.port';
import type { MineRegistry } from '../combat/mine.registry';
import { MineRepository, MineRefusedError } from '../combat/mine.repository';
import type { CombatTickService } from '../combat/combat-tick.service';
import { cdistance, inScanRange, shieldhit } from '../combat/combat-math';
import {
  COMBAT_PHASER_FIRED,
  COMBAT_HIT,
  CombatPhaserFiredEvent,
  CombatHitEvent,
  COMBAT_TARGET_WARNING,
  CombatTargetWarningEvent,
} from '../combat/combat-events';
import { applyRandamageAndEmit } from '../combat/randamage.apply';
import { selectPhaserVictims } from '../combat/firep';
import { selectHyperVictims } from '../combat/firehp';
import { findFreeTorpSlot } from '../combat/projectile-slots';
import { AI_MINE_TIMER, FIRETICKS, GESTAT_AUTO, HPFIRAMT, HPMINFIR, PMINFIRE, SHIELDDM } from '../constants';
import { I_MINE, I_TORP } from '../constants/items';
import type { ShipClassCacheService } from '../physics/ship-class-cache.service';
import { CYBMINE_NONE, NO_CHANNEL } from '../ship/ship-channel.registry';
import type { ShipStateService } from '../ship/ship-state.service';
import type { ShipState } from '../ship/ship-state.types';
import { shipKey } from '../ship/ship-state.types';
import type { TickContext } from '../tick/tick.types';
import { provoke } from '../cybertron/cyb-transitions';
import type { CybTraceService } from '../cybertron/cyb-trace.service';

/** What `AiWeapons` needs. Optional members degrade exactly as they did in the tick. */
export interface AiWeaponsDeps {
  shipState: ShipStateService;
  classes: ShipClassCacheService;
  events: EventEmitter2;
  random: Random;
  logger: Logger;
  combatTick?: CombatTickService;
  mineRegistry?: MineRegistry;
  mineRepo?: MineRepository;
  trace?: CybTraceService;
}

/**
 * The weapons an AI fires — canon's own player functions, which is what both AI
 * kinds call:
 *
 *   firep    GECYBS.C:519 `firep(ptr,usrn);`
 *            GEDROIDS.C:366 `firep(ptr,usrn);`
 *   firehp   GECYBS.C:278 `firehp(ptr,usrn);`
 *            GEDROIDS.C:354 `firehp(ptr,usrn);`
 *   torp     GECYBS.C:538 `torp(ptr,usrn,zothusn);`
 *            GEDROIDS.C:482 `torp(ptr,usrn,zothusn);`
 *   laymine  GECYBS.C:315 `laymine(ptr,usrn,10);`
 *            GEDROIDS.C:512 `laymine(ptr,usrn,10);`
 *   zip      the zipper sweep, handed the round it fires (GECYBS.C, cyb_attack)
 *
 * The actuator half of the AI: the brain decides, this fires. It holds no state,
 * so an AI service builds one from its own dependencies.
 *
 * Moved here verbatim from `CybertronTickService` for #62; the Droid's
 * separate copies join it in the second stage of that issue.
 * @see docs/superpowers/specs/2026-09-21-ai-weapons-split-design.md
 */
export class AiWeapons {
  private readonly shipState: ShipStateService;
  private readonly classes: ShipClassCacheService;
  private readonly events: EventEmitter2;
  private readonly random: Random;
  private readonly logger: Logger;
  private readonly combatTick?: CombatTickService;
  private readonly mineRegistry?: MineRegistry;
  private readonly mineRepo?: MineRepository;
  private readonly trace?: CybTraceService;

  constructor(deps: AiWeaponsDeps) {
    this.shipState = deps.shipState;
    this.classes = deps.classes;
    this.events = deps.events;
    this.random = deps.random;
    this.logger = deps.logger;
    this.combatTick = deps.combatTick;
    this.mineRegistry = deps.mineRegistry;
    this.mineRepo = deps.mineRepo;
    this.trace = deps.trace;
  }

  /** A hit turns an AI on the shooter; traced when there is a trace. */
  private tx(ship: ShipState, event: string, apply: () => void, detail?: string): void {
    if (this.trace) this.trace.transition(shipKey(ship.userid, ship.shipno), ship, event, apply, detail);
    else apply();
  }

  /**
   * `firehp` for an AI hull: a fixed 5-degree beam, damage straight to hull,
   * no shield interaction. @see GECMDS.C:1044-1083, called from GECYBS.C:279
   */
  firehp(ship: ShipState, target: ShipState, ctx: TickContext): void {
    // Aim first, exactly as the branch above the call does in canon.
    const dx = target.xcoord - ship.xcoord;
    const dy = target.ycoord - ship.ycoord;
    const absAngle = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.degrees = Math.round((absAngle - ship.heading + 360) % 360);
    });

    // The ENTIRE body of `firehp` sits inside `if (ptr->energy >= HPMINFIR)`
    // (GECMDS.C:1029). Below 6,000 flux nothing happens at all — no shot, no
    // debit, no cooldown — and the gate is `>=`, so exactly 6,000 fires. The
    // player path has honoured this all along; this one had no gate.
    if (ship.energy < HPMINFIR) return;

    // `firehp` then charges the FIRER, before it looks for a victim:
    //
    //   ptr->energy -= HPFIRAMT;
    //   ptr->hypha = 1;
    //   ptr->cantexit = FIRETICKS;      -- GECMDS.C:1039-1041
    //
    // This path set only the battle lock, so a Cybertron's hyper-phaser cost it
    // nothing and had no cooldown while a player paid 5,000 flux and waited for
    // hypha to clear. Same shape as the torpedo lock the AI skipped on
    // 2026-09-09: an AI path missing a constraint the player path honours.
    //
    // Canon does NOT gate the AI on `hypha` the way `cmd_phas` gates a player
    // (GECYBS.C:279 calls firehp unconditionally, GECMDS.C:849 does not) — that
    // asymmetry is canon and is deliberately left alone.
    //
    // firehp's neutral-zone self-zap (GECMDS.C:1031) is unreachable from here:
    // `runEngagementScan` returns before firing when the Cybertron is inside
    // the zone, so an AI never calls this from within it.
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.energy = s.energy - HPFIRAMT;
      s.hypha = 1;
      s.cantexit = FIRETICKS;
    });

    const scanRange = this.classes.get(ship.shpclass)?.scanRange ?? 100_000;
    const victims = selectHyperVictims({
      firer: ship,
      allShips: this.shipState.findAllShips(),
      // RELATIVE to the hull, as the pilot's `pha` passes it: the selection
      // adds the heading itself. Passing `absAngle` added it twice, so a hull
      // at any heading but 0 fired somewhere else. @see ai-weapons-aim.spec.ts
      degree: ship.degrees,
      scanRange,
      maxTonsFor: (c) => this.classes.getMaxTons(c),
    });

    for (const { victim, damage } of victims) {
      // `wptr->damage += damage` — straight to hull, no shieldhit; firehp
      // bypasses shields entirely. Both ships are battle-locked, and an AI
      // victim is turned onto the shooter. @see GECMDS.C:1071-1081
      this.shipState.mutate(victim.userid, victim.shipno, (v) => {
        v.damage += damage;
        v.lastfired = ship.channel ?? NO_CHANNEL;
        v.lastWeapon = 'phaser';
        v.lastfiredBy = { channel: ship.channel ?? NO_CHANNEL, name: ship.shipname };
        v.cantexit = FIRETICKS;
        this.tx(v, 'provoke', () => provoke(v, ship.channel ?? NO_CHANNEL), `hit by ${ship.shipname}`);
      });
      this.shipState.mutate(ship.userid, ship.shipno, (s) => { s.cantexit = FIRETICKS; });

      this.events.emit(COMBAT_HIT, {
        attackerId: shipKey(ship.userid, ship.shipno),
        victimId: shipKey(victim.userid, victim.shipno),
        weapon: 'phaser',
        damageHull: damage,
        damageShield: 0,
        sector: { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) },
        tickAt: ctx.firedAt,
      } as CombatHitEvent);

      // Every victim rolls for a knocked-out system, as after a phaser hit:
      //   GECMDS.C:1082 `randamage(wptr,othusn); /*assess any random damage */`
      // The Cybertron copy of firehp had lost this line and the Droid copy kept
      // it; one shared firehp now carries canon's. @see issue #62
      applyRandamageAndEmit(this.random, this.events, this.classes, victim,
        { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) }, ctx.firedAt);
    }
  }

  /**
   * Canon's `firep`: discharge the bank into the arc around `heading + degrees`
   * at focus `percent`, hitting every ship in it.
   *
   * Whether the shooter AIMS first is the caller's canon, not firep's: a
   * Cybertron points at its target (GECYBS.C:281 `ptr->degrees = (int)(cbearing(&ptr->coord,&wptr->coord,ptr->heading)+.5);`)
   * while a Droid fires down its nose (GEDROIDS.C:361 `ptr->degrees = 0;`).
   */
  firep(ship: ShipState, target: ShipState, ctx: TickContext, opts: { aimAtTarget: boolean } = { aimAtTarget: true }): void {
    if (ship.phasr < PMINFIRE) return;

    // A-002: defense-in-depth range gate. The engagement-scan loop already gates
    // candidates on `ddist > scanRange`, but `cybFirePhaser` bypasses
    // `PhaserHandlerService.handle()` and therefore inherits NONE of C-001's
    // player-side gate. Mirror it here so future callers cannot bypass.
    // @see specs/022-fidelity-audit-v2/findings.md A-002
    const scanRangeGate = this.classes.get(ship.shpclass)?.scanRange ?? 100_000;
    if (!inScanRange(ship, target, scanRangeGate)) return;

    const attackerId = shipKey(ship.userid, ship.shipno);
    const dx = target.xcoord - ship.xcoord;
    const dy = target.ycoord - ship.ycoord;
    const absAngle = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
    const bearing = (absAngle - ship.heading + 360) % 360;

    // AIM. Canon sets the bearing to the target immediately before every
    // discharge, in BOTH engagement branches:
    //   ptr->degrees = (int)(cbearing(&ptr->coord,&wptr->coord,ptr->heading)+.5);
    // @see GECYBS.C:276-277 (hyperspace) and :281 (normal space)
    //
    // `firep` sweeps the cone around `heading + degrees` (GECMDS.C:946-1004),
    // so without this a Cybertron fires straight down its hull facing and only
    // connects when the target drifts into the nose. The bearing was already
    // being computed here for the fired-event payload; it was simply never
    // written back to the ship.
    if (opts.aimAtTarget) {
      this.shipState.mutate(ship.userid, ship.shipno, (s2) => {
        s2.degrees = Math.round(bearing);
      });
    }
    const sector = { x: Math.floor(ship.xcoord), y: Math.floor(ship.ycoord) };
    const tickAt = ctx.firedAt;

    const firedEvent: CombatPhaserFiredEvent = {
      shipId: attackerId,
      bearing: opts.aimAtTarget ? bearing : ship.degrees,
      percent: 100,
      hyper: false,
      sector,
      tickAt,
    };
    this.events.emit(COMBAT_PHASER_FIRED, firedEvent);

    // Runtime invariants: record AI fire + combat-range event at fire time.
    // distanceRaw = cdistance × 10_000 (raw coord units); maxRange uses the
    // same scanRange-derived cap as the player phaser path (C-001).
    if (this.combatTick) {
      const distanceRaw = cdistance(ship, target) * 10_000;
      this.combatTick.recordAiFireEvent({
        shipClass: String(ship.shpclass),
        shooter: { x: ship.xcoord, y: ship.ycoord },
        target: { x: target.xcoord, y: target.ycoord },
        scanRange: scanRangeGate,
        distanceRaw,
      });
      this.combatTick.recordCombatEvent({
        weapon: 'phaser',
        shooter: { x: ship.xcoord, y: ship.ycoord },
        target: { x: target.xcoord, y: target.ycoord },
        maxRange: scanRangeGate / 10_000,
      });
    }

    // firep sweeps the ARC, not a target: one discharge reaches every ship in
    // the cone, bystanders and other AI included (`ingegame()` is TRUE for
    // GESTAT_AUTO). `target` only decides where the Cybertron is POINTING.
    // @see GECMDS.C:946-1004
    const { victims } = selectPhaserVictims({
      firer: ship,
      allShips: this.shipState.findAllShips(),
      // RELATIVE, for the same reason as firehp above: `withinArc` adds the
      // heading (canon's `normal(ptr->heading + ptr->degrees)`, GECMDS.C:1035).
      degree: ship.degrees,
      focus: ship.percent,
      phasrCharge: ship.phasr,
      scanRange: scanRangeGate,
      maxTonsFor: (c) => this.classes.getMaxTons(c),
    });

    for (const { victim, damage } of victims) {
      // A hit on an AI makes it turn on the shooter, overriding whatever it was
      // chasing — this is what turns stray fire into a fight rather than silent
      // chip damage. @see GECMDS.C:980-981
      if (victim.status === GESTAT_AUTO) {
        this.shipState.mutate(victim.userid, victim.shipno, (v) =>
          this.tx(v, 'provoke', () => provoke(v, ship.channel ?? NO_CHANNEL), `hit by ${ship.shipname}`));
      }

      const shieldUp = victim.shieldstat === 1;
      let hullDamage = damage;
      let shieldConsumed = 0;

      if (shieldUp) {
        const result = shieldhit(victim.shield, victim.shieldtype, damage);
        this.shipState.mutate(victim.userid, victim.shipno, (v) => {
          v.shield = result.newCharge;
          // @see GEFUNCS.C:2459-2462 — SHIELDDM, not plain "down".
          if (result.outcome === 'damaged') v.shieldstat = SHIELDDM;
          v.lastfired = ship.channel ?? NO_CHANNEL;
          v.lastWeapon = 'phaser';
          // Name the firer where the damage lands: a channel scrub on logout
          // would otherwise leave the loss mail with nobody to blame. The AI
          // path never set this, so a player killed by a Cybertron got
          // "an unknown assailant". @see attackerNameFromLastFired
          v.lastfiredBy = { channel: ship.channel ?? NO_CHANNEL, name: ship.shipname };
          v.cantexit = FIRETICKS;
        });
        hullDamage = 0;
        shieldConsumed = result.shieldConsumed;
      } else {
        this.shipState.mutate(victim.userid, victim.shipno, (v) => {
          v.damage = v.damage + hullDamage;
          v.lastfired = ship.channel ?? NO_CHANNEL;
          v.lastWeapon = 'phaser';
          v.lastfiredBy = { channel: ship.channel ?? NO_CHANNEL, name: ship.shipname };
          v.cantexit = FIRETICKS;
        });
      }

      const hitEvent: CombatHitEvent = {
        attackerId,
        victimId: shipKey(victim.userid, victim.shipno),
        weapon: 'phaser',
        damageHull: hullDamage,
        damageShield: shieldConsumed,
        sector,
        tickAt,
      };
      this.events.emit(COMBAT_HIT, hitEvent);

      // @see GEFUNCS.C:randamage — after every phaser hit (GECMDS.C:999)
      applyRandamageAndEmit(this.random, this.events, this.classes, victim, sector, tickAt);
    }

    // The bank is spent whatever the shot achieves — GECMDS.C:1006
    // `ptr->phasr = 0;` sits outside the victim loop — but the shooter is only
    // locked into combat by a hit that lands, inside canon's gate:
    //   GECMDS.C:975 `if (damage >= 1)`
    //   GECMDS.C:978 `ptr->cantexit = FIRETICKS;`
    // `selectPhaserVictims` returns only victims past that gate. The Cybertron
    // copy locked itself in on every discharge; the Droid copy had it right.
    ship.phasr = 0;
    if (victims.length > 0) ship.cantexit = FIRETICKS;
  }

  /**
   * Queue a torpedo into the target's incoming torpedo array.
   * @see GECYBS.C:534-543 cyb_attack — torp launch
   */
  torp(
    ship: ShipState,
    target: ShipState,
    ddist: number,
    announce: boolean,
  ): void {
    // Bounded by MAXTORPS, never by the array's length — see findFreeTorpSlot.
    const emptySlot = findFreeTorpSlot(target.ltorpsChannel);
    if (emptySlot === -1) return; // all slots full
    // Spent only once a tube is actually free, as canon does it:
    //   GECMDS.C:1195 `--ptr->items[I_TORPEDO];`
    ship.items = [...ship.items] as typeof ship.items;
    ship.items[I_TORP] = BigInt(Math.max(0, Number(ship.items[I_TORP]) - 1));
    this.shipState.mutate(target.userid, target.shipno, (v) => {
      while (v.ltorpsChannel.length <= emptySlot) v.ltorpsChannel.push(255);
      while (v.ltorpsDistance.length <= emptySlot) v.ltorpsDistance.push(0);
      v.ltorpsChannel[emptySlot] = ship.channel ?? NO_CHANNEL;
      v.ltorpsDistance[emptySlot] = ddist;
    });

    // `prfmsg(TFIRE2,shpltr(shpnum,usrn)); outprfge(FILTER,shpnum);` — the
    // TARGET is told as the tube fires (GECMDS.C:1198-1199). This path emitted
    // nothing at all, so an AI volley arrived in silence and the first a pilot
    // knew of it was the hit. The gateway already maps `torpedo-launched` to
    // TORP_INBOUND; only the AI never raised it.
    if (announce) {
      this.events.emit(COMBAT_TARGET_WARNING, {
        victimId: shipKey(target.userid, target.shipno),
        attackerId: shipKey(ship.userid, ship.shipno),
        // NOT computed here. This used to be
        // `String.fromCharCode(65 + (ship.channel % 26))` — a letter derived
        // from the ATTACKER's channel, which has nothing to do with the
        // victim's scan table. It named ships the pilot had never scanned, and
        // could have named a letter belonging to one of their other contacts.
        // The gateway resolves it from `attackerId` against the victim's own
        // scantab, as canon's shpltr does. @see GEFUNCS.C:2578
        attackerLetter: '',
        kind: 'torpedo-launched',
        tickAt: new Date(),
      } satisfies CombatTargetWarningEvent);
    }
  }

  /**
   * Drop a neutron mine where the ship is standing.
   *
   * `laymine(ptr, usrn, 10)` — GECYBS.C:315, reached from the branch whose own
   * comment is "as long as they can't see ... the other player must be trying
   * to get away.... might as well mine the area". `laymine` itself claims a
   * free slot, sets `cantexit = FIRETICKS`, writes the LAYER's channel and the
   * ship's coordinates, and decrements `items[I_MINE]` inside the success
   * branch — a refused lay costs nothing (GECMDS.C:1805-1818).
   *
   * This was a stub: it spent the mine and produced nothing, so a Cybertron
   * burned its magazine over a session and left an empty galaxy behind it,
   * while droids laid real ones. The channel matters as much as the mine — a
   * mine kill sets the victim's `lastfired` to it, which is how the ship-loss
   * mail can name who left it there.
   */
  laymine(ship: ShipState): void {
    if (!this.mineRepo || !this.mineRegistry) return;

    const channel = ship.channel ?? CYBMINE_NONE;
    void this.mineRepo.create({
      channel,
      timer: AI_MINE_TIMER,
      xcoord: ship.xcoord,
      ycoord: ship.ycoord,
      deployedBy: ship.userid,
    }).then((mine) => {
      // Spend the mine only once the slot is actually taken.
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.items = [...s.items] as typeof s.items;
        s.items[I_MINE] = BigInt(Math.max(0, Number(s.items[I_MINE]) - 1));
        s.cantexit = FIRETICKS;
      });
      this.mineRegistry?.add({ ...mine, deployedBy: ship.userid });
    }).catch((err: unknown) => {
      if (err instanceof MineRefusedError) return; // canon: laymine returned 0, nothing spent
      this.logger.error('Cybertron mine lay failed:', err);
    });
  }

  /**
   * `zip()` from the Cybertron's seat: destroy every mine inside the class's
   * scan range. @see GECMDS.C:1690-1712 cmd_zipper
   */
  zip(ship: ShipState): void {
    if (!this.mineRegistry) return;
    const scanRange = this.classes.get(ship.shpclass)?.scanRange ?? 0;
    for (const mine of this.mineRegistry.getAll()) {
      if (cdistance(ship, mine) * 10_000 >= scanRange) continue;
      void this.mineRepo?.delete(mine.id).catch((err: unknown) => {
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`Cybertron zipper mine delete failed: ${stack}`);
      });
      this.mineRegistry.remove(mine.id);
    }
  }
}
