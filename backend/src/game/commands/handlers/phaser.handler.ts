import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState, shipKey } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { NO_CHANNEL } from '../../ship/ship-channel.registry';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { Random, RANDOM } from '../../combat/random.port';
import {
  cdistance,
  damstr,
  hyperPhaserDamage,
  inScanRange,
  lineOfFire,
  phaserDamage,
  shieldhit,
  withinArc,
} from '../../combat/combat-math';
import { isInNeutralZone } from '../../combat/neutral-zone';
import { displayName } from '../../ship/display-name';
import { selectHyperVictims } from '../../combat/firehp';
import { selectPhaserVictims } from '../../combat/firep';
import {
  COMBAT_HIT,
  COMBAT_MISS,
  COMBAT_PHASER_FIRED,
  CombatHitEvent,
  CombatMissEvent,
  CombatPhaserFiredEvent,
} from '../../combat/combat-events';
import { applyRandamageAndEmit } from '../../combat/randamage.apply';
import {
  FIRETICKS,
  HPBEAMW,
  HPFIRAMT,
  HPMINFIR,
  PHATOWRP,
  PMINFIRE,
  SE100DAM,
  WARP_THRESHOLD,
  SHIELDDM,
  GESTAT_AUTO,
} from '../../constants';
import { CombatTickService } from '../../combat/combat-tick.service';
import { dropShieldsForFire } from '../../combat/shield-drop';

/**
 * Handles `pha` / `phasor` — ship-to-ship phaser fire.
 *
 * Command form (GECMDS.C:cmd_phas 868-892):
 *   `pha <degree>`           → focus defaults to 1
 *   `pha <degree> <focus>`   → focus ∈ [0, 5]
 *
 * `degree` is a RELATIVE bearing ∈ [−180, 180]; the absolute firing direction
 * is `heading + degree` (GEFUNCS.C:valdegree). The beam half-angle is
 * `focus + PHABIAS` (GECMDS.C:954). Phaser always FULLY discharges on fire
 * (`phasr → 0`, GECMDS.C:1006).
 *
 * Validations (mirror GECMDS.C:firep 914-1013):
 *   1. `phasrtype > 0` (phaser mounted) — else PHA_NOPHAS
 *   2. `phasr >= PMINFIRE` — else PHA_NOPOW
 *   3. degree ∈ [−180, 180] — else NUMOOR(−180, 180)
 *   4. focus ∈ [0, 5] (when supplied) — else NUMOOR(0, 5)
 *   5. firer not cloaked (`cloak == 0`) — else PHA_CLOAK (GECMDS.C:923)
 *   6. firing inside the neutral zone self-zaps (GECMDS.C:937 zaphim):
 *      firer takes SE100DAM hull damage and nothing else. C returns at :940,
 *      before `cantexit = FIRETICKS` (:945) and before `phasr = 0` (:1006), so
 *      the charge is kept and the ship can still jump.
 *
 * Per victim (GECMDS.C:946-1004): a victim at warp is unreachable unless
 * `phasrtype >= PHATOWRP` (949); victims inside the neutral zone are immune
 * (951); the candidate must be in scan range (C-001) and within the firing
 * arc. Damage comes from `phaserDamage(...)` (integer) and is applied through
 * raised shields via `shieldhit`, else straight to hull. Each hit victim and
 * the firer get `cantexit = FIRETICKS`.
 *
 * Note: a firer AT warp (`speed >= WARP_THRESHOLD`) fires the HYPER-phaser
 * instead — see {@link PhaserHandlerService.handleHyper} / `firehp`
 * (GECMDS.C:1020). True separation landed in Plan 3 T3 (C-009).
 *
 * Emits:
 *   - `combat.phaser-fired` once
 *   - `combat.hit` per victim hit
 *   - `combat.miss` once iff no victims hit
 *
 * @see GECMDS.C:cmd_phas, GECMDS.C:firep
 */
@Injectable()
export class PhaserHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly shipClassCache: ShipClassCacheService,
    private readonly events: EventEmitter2,
    @Inject(RANDOM) private readonly random: Random,
    @Optional() private readonly combatTick?: CombatTickService,
  ) {}

  readonly command: Command = {
    keyword: 'pha',
    aliases: ['phasor'],
    minArgs: 1,
    argMissingMessage: formatMessage(MessageId.PHA_FMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult => {
      return this.handle(ship, args);
    },
  };

  private handle(ship: ShipState, args: string[]): CommandResult {
    // 1. Phaser mounted?
    if (ship.phasrtype <= 0) {
      return { lines: [{ text: formatMessage(MessageId.PHA_NOPHAS), category: 'system' }] };
    }

    // 2. Charged? (NORMAL beam only — the hyper-phaser is gated on flux energy,
    //    not phasr charge, so a warping firer skips this check.)
    if (ship.speed < WARP_THRESHOLD && ship.phasr < PMINFIRE) {
      return { lines: [{ text: formatMessage(MessageId.PHA_NOPOW), category: 'system' }] };
    }

    // Parse: pha <degree> [focus]
    const degreeArg = (args[0] ?? '').trim();
    if (!/^-?\d+$/.test(degreeArg)) {
      return { lines: [{ text: formatMessage(MessageId.PHA_FMT), category: 'system' }] };
    }
    const degree = parseInt(degreeArg, 10);
    if (degree < -180 || degree > 180) {
      return { lines: [{ text: formatMessage(MessageId.NUMOOR, -180, 180), category: 'system' }] };
    }
    let focus = 1; // `pha <degree>` ⇒ focus defaults to 1 (GECMDS.C:874)
    if (args[1] !== undefined) {
      const focusArg = args[1].trim();
      if (!/^\d+$/.test(focusArg)) {
        return { lines: [{ text: formatMessage(MessageId.PHA_FMT), category: 'system' }] };
      }
      focus = parseInt(focusArg, 10);
      if (focus < 0 || focus > 5) {
        return { lines: [{ text: formatMessage(MessageId.NUMOOR, 0, 5), category: 'system' }] };
      }
    }

    // 5. Cloak gate (GECMDS.C:923)
    if (ship.cloak > 0) {
      return { lines: [{ text: formatMessage(MessageId.PHA_CLOAK), category: 'system' }] };
    }

    // C-009: a firer AT WARP fires the HYPER-phaser (firehp, GECMDS.C:1020),
    // an entirely separate weapon — flux-gated, fixed 5° beam, warp-only victims.
    if (ship.speed >= WARP_THRESHOLD) {
      return this.handleHyper(ship, degree, focus);
    }

    const scanRange = this.shipClassCache.getScanRange(ship.shpclass);
    const sectorX = Math.floor(ship.xcoord);
    const sectorY = Math.floor(ship.ycoord);
    const tickAt = new Date();
    const attackerId = shipKey(ship.userid, ship.shipno);

    // Current phaser charge feeds the damage formula (phasr/100 scaling).
    const phasrCharge = ship.phasr;

    // Shields drop FIRST — C does this at GECMDS.C:930-933, before the
    // PMINFIRE gate and before the neutral-zone return, so firing costs your
    // shields even when the shot never leaves the ship.
    const shieldLine = dropShieldsForFire(ship, (fn) =>
      this.shipState.mutate(ship.userid, ship.shipno, fn));

    // 6. Neutral-zone self-zap (GECMDS.C:937-941 zaphim): firer backfires.
    // This must execute BEFORE emitting COMBAT_PHASER_FIRED so that no fired
    // event leaks when the beam never actually leaves the ship.
    if (isInNeutralZone(ship)) {
      // The neutral branch is an EARLY ABORT that costs hull damage only. C
      // returns at GECMDS.C:940, before `cantexit = FIRETICKS` (:945) and
      // before `phasr = 0` (:1006), so the firer keeps both its charge and its
      // ability to jump. The port added both as extra penalties.
      //
      // (zaphim's own body is not in the distribution -- only its declaration
      // in GEPROTO.H -- so this rests on the call-site structure rather than on
      // reading the function. Nothing in that structure spends the charge.)
      //
      // It matters because everyone spawns at (0,0): one mistaken keypress cost
      // 40 hull, the entire phaser bank, and a warp lockout. With SE100DAM back
      // at its shipped 10, it now costs 10 hull and nothing else.
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.damage = s.damage + SE100DAM;
      });
      return {
        lines: [
          ...(shieldLine ? [shieldLine] : []),
          { text: formatMessage(MessageId.WPN_ZAP), category: 'combat' },
        ],
      };
    }

    // Emit fired event. `bearing`/`percent` carry the relative degree/focus.
    // Only emitted once the beam actually leaves the ship (post-NZ check).
    const firedEvent: CombatPhaserFiredEvent = {
      shipId: attackerId,
      bearing: degree,
      percent: focus,
      hyper: false,
      sector: { x: sectorX, y: sectorY },
      tickAt,
    };
    this.events.emit(COMBAT_PHASER_FIRED, firedEvent);

    // Find victims in arc.
    const allShips = this.shipState.findAllShips();
    let hits = 0;
    const lines: CommandResult['lines'] = [];

    // `prfmsg(HPFIRED,deg); outprfge(FILTER,usrn);` — the shot announces
    // itself to the firer before any hit is resolved. @see GECMDS.C:1037
    lines.push({ text: formatMessage(MessageId.HP_FIRED, Math.round(degree)), category: 'combat' });

    // The discharge notice, before any per-victim result. C prints
    // `prfmsg(PFIRED,(int)ptr->phasr,ptr->percent)` at GECMDS.C:943-944 — the
    // power the bank actually held and the focus used. Without it a pilot has
    // no confirmation of what they fired, which matters because the phaser
    // fires at whatever charge it has and empties itself either way.
    lines.push({
      text: formatMessage(MessageId.PFIRED, phasrCharge, focus),
      category: 'combat',
    });

    // One shared `firep` selection, used by the AI path too: canon has exactly
    // one of these and the port's two copies had already drifted apart once.
    // @see src/game/combat/firep.ts, GECMDS.C:946-1004
    const sweep = selectPhaserVictims({
      firer: ship,
      allShips,
      degree,
      focus,
      phasrCharge,
      scanRange,
      maxTonsFor: (c) => this.shipClassCache.getMaxTons(c),
    });

    for (const { victim: candidate, damage } of sweep.victims) {
      // A hit on a Cybertron makes you its target, overriding whatever it was
      // chasing and the noClaim rules. Without this, PvE was pure proximity:
      // you could not pull one off a teammate, and one you shot ignored you.
      // @see GECMDS.C:980-981 `if (wptr->status == GESTAT_AUTO) wptr->cybmine = usrn;`
      if (candidate.status === GESTAT_AUTO) {
        this.shipState.mutate(candidate.userid, candidate.shipno, (v) => {
          v.cybmine = ship.channel ?? NO_CHANNEL;
        });
      }

      // C branches solely on `shieldstat != SHIELDUP` (GECMDS.C:986).
      // shieldup() grants no charge (GEFUNCS.C:2409-2415), so a shield raised
      // on an empty capacitor still absorbs the next hit in full — and blows
      // on it. Requiring charge > 0 here handed full hull damage to anyone who
      // had just raised shields.
      const shieldUp = candidate.shieldstat === 1;
      let hullDamage = damage;
      let shieldConsumed = 0;

      if (shieldUp) {
        const r = shieldhit(candidate.shield, candidate.shieldtype, damage);
        this.shipState.mutate(candidate.userid, candidate.shipno, (v) => {
          v.shield = r.newCharge;
          // Only a BLOWN shield goes out of action, and it goes into SHIELDDM
          // — not plain "down" — so `shi up` refuses until it is repaired.
          // @see GEFUNCS.C:2459-2462
          if (r.outcome === 'damaged') v.shieldstat = SHIELDDM;
          v.lastfired = ship.channel ?? NO_CHANNEL;
          // Name the firer here, where the damage lands, so a channel scrub on
          // logout cannot erase the attribution. @see attackerNameFromLastFired
          v.lastfiredBy = { channel: ship.channel ?? NO_CHANNEL, name: ship.shipname };
          v.cantexit = FIRETICKS;
        });
        hullDamage = 0;
        shieldConsumed = r.shieldConsumed;
      } else {
        this.shipState.mutate(candidate.userid, candidate.shipno, (v) => {
          v.damage = v.damage + hullDamage;
          v.lastfired = ship.channel ?? NO_CHANNEL;
          v.lastfiredBy = { channel: ship.channel ?? NO_CHANNEL, name: ship.shipname };
          v.cantexit = FIRETICKS;
        });
      }

      const hitEvent: CombatHitEvent = {
        attackerId,
        victimId: shipKey(candidate.userid, candidate.shipno),
        weapon: 'phaser',
        damageHull: hullDamage,
        damageShield: shieldConsumed,
        sector: { x: sectorX, y: sectorY },
        tickAt,
      };
      this.events.emit(COMBAT_HIT, hitEvent);

      // @see GEFUNCS.C:randamage — called after every phaser hit (GECMDS.C:999)
      applyRandamageAndEmit(this.random, this.events, this.shipClassCache, candidate, { x: sectorX, y: sectorY }, tickAt);

      // Record for runtime invariant `weaponFireRangeRespected`. The legal
      // cap for a player phaser is the firer's scanRange (in cdistance units:
      // scanRange / 10_000 sectors), enforced by C-001.
      this.combatTick?.recordCombatEvent({
        weapon: 'phaser',
        shooter: { x: ship.xcoord, y: ship.ycoord },
        target: { x: candidate.xcoord, y: candidate.ycoord },
        maxRange: scanRange / 10_000,
      });
      hits++;
      // Canon narrates the two outcomes DIFFERENTLY, and the distinction is
      // the point: PHITHIM when the hull takes it, PDEFLECT when the shields
      // turn the beam (GECMDS.C:983-997). The port printed one debug line for
      // both, so a shooter could not tell a deflection from a miss — three
      // playtesters concluded from that that phasers were broken.
      // damstr renders hull damage as a WORD; a deflection reports a number.
      lines.push({
        text: shieldUp
          ? formatMessage(MessageId.PDEFLECT, candidate.shipname)
          : formatMessage(MessageId.PHITHIM, damstr(hullDamage), candidate.shipname),
        category: 'combat',
      });
    }

    if (hits === 0) {
      const missEvent: CombatMissEvent = {
        attackerId,
        weapon: 'phaser',
        sector: { x: sectorX, y: sectorY },
        tickAt,
      };
      this.events.emit(COMBAT_MISS, missEvent);
      // Canon prints nothing here; this summary is ours. Say something TRUE:
      // a ship that was inside the cone and excluded only by the hyperspace
      // gate is not an empty arc. @see GECMDS.C:949, test/game/combat/phaser-no-hit-reason.spec.ts
      lines.push({
        text: sweep.unreachableAtWarp > 0
          ? 'Phasers fired — the beam passes through a ship at warp.'
          : 'Phasers fired — no targets in arc.',
        category: 'combat',
      });
    }

    // Full discharge of the firer (GECMDS.C:1006). The shield drop is NOT here
    // — C performs it before the charge gate, so it is handled above.
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.phasr = 0;
      s.cantexit = FIRETICKS;
    });

    if (shieldLine) lines.unshift(shieldLine);
    return { lines };
  }

  /**
   * Hyper-phaser fire (firer AT warp). Ports `firehp` (GECMDS.C:1020-1094) —
   * a distinct weapon from the normal beam:
   *   - flux-gated: requires `energy >= HPMINFIR`, else HP_NOPOW (no fire/debit);
   *   - costs `HPFIRAMT` flux energy (NOT a phasr discharge), keeps shields up;
   *   - fixed `HPBEAMW` (5°) half-angle beam — focus is irrelevant to the arc;
   *   - ONLY reaches victims at warp (`where==1`); neutral-zone victims immune;
   *   - damage from `hyperPhaserDamage` (pdamage warp branch × `* phasrtype`).
   * Firing inside the neutral zone self-zaps exactly like the normal path.
   *
   * @see GECMDS.C:1020 firehp  @see GEFUNCS.C:2069 pdamage (warp branch)
   */
  private handleHyper(ship: ShipState, degree: number, focus: number): CommandResult {
    // Hypha cooldown gate (GECMDS.C:849-857): checked BEFORE the energy gate,
    // matching cmd_phas order — hypha check precedes firehp call.
    // Physics tick decrements hypha toward 0 (physics-tick.service.ts:~155).
    if (ship.hypha !== 0) {
      return { lines: [{ text: formatMessage(MessageId.HP_WAIT), category: 'system' }] };
    }

    // Flux-energy gate (GECMDS.C:1029 HPMINFIR) — no fire, no debit.
    if (ship.energy < HPMINFIR) {
      return { lines: [{ text: formatMessage(MessageId.HP_NOPOW), category: 'system' }] };
    }

    const scanRange = this.shipClassCache.getScanRange(ship.shpclass);
    const sectorX = Math.floor(ship.xcoord);
    const sectorY = Math.floor(ship.ycoord);
    const tickAt = new Date();
    const attackerId = shipKey(ship.userid, ship.shipno);

    // Neutral-zone self-zap (GECMDS.C:1031 zaphim) — same backfire as normal,
    // BEFORE any fired event leaks.
    if (isInNeutralZone(ship)) {
      // The neutral branch is an EARLY ABORT that costs hull damage only. C
      // returns at GECMDS.C:940, before `cantexit = FIRETICKS` (:945) and
      // before `phasr = 0` (:1006), so the firer keeps both its charge and its
      // ability to jump. The port added both as extra penalties.
      //
      // (zaphim's own body is not in the distribution -- only its declaration
      // in GEPROTO.H -- so this rests on the call-site structure rather than on
      // reading the function. Nothing in that structure spends the charge.)
      //
      // It matters because everyone spawns at (0,0): one mistaken keypress cost
      // 40 hull, the entire phaser bank, and a warp lockout. With SE100DAM back
      // at its shipped 10, it now costs 10 hull and nothing else.
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.damage = s.damage + SE100DAM;
      });
      return { lines: [{ text: formatMessage(MessageId.WPN_ZAP), category: 'combat' }] };
    }

    // Beam leaves the ship (GECMDS.C:1037 HPFIRED). hyper=true.
    const firedEvent: CombatPhaserFiredEvent = {
      shipId: attackerId,
      bearing: degree,
      percent: focus,
      hyper: true,
      sector: { x: sectorX, y: sectorY },
      tickAt,
    };
    this.events.emit(COMBAT_PHASER_FIRED, firedEvent);

    // Flux debit + battle-lock + hypha cooldown (GECMDS.C:1039-1041).
    // Hyper does NOT discharge phasr (uses flux) and does NOT drop shields
    // (firehp omits shielddn). hypha=1 arms the cooldown — physics tick
    // decrements it toward 0 (physics-tick.service.ts:~155).
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.energy = s.energy - HPFIRAMT;
      s.cantexit = FIRETICKS;
      s.hypha = 1;
    });

    const allShips = this.shipState.findAllShips();
    let hits = 0;
    const lines: CommandResult['lines'] = [];

    // Victim selection is canon's firehp, shared with the AI path — canon has
    // ONE firehp and both the player command and GECYBS.C:279 call it.
    // @see src/game/combat/firehp.ts
    for (const { victim: candidate, damage } of selectHyperVictims({
      firer: ship,
      allShips,
      degree,
      scanRange,
      maxTonsFor: (c) => this.shipClassCache.getMaxTons(c),
    })) {
      if (damage < 1) continue;

      // C-009 Fix 1: firehp applies damage STRAIGHT TO HULL (`wptr->damage += damage`,
      // GECMDS.C:1078) — no shieldhit call, shields are bypassed entirely.
      // A hyper hit claims a Cybertron exactly as a normal one does.
      // @see GECMDS.C:1071-1072
      this.shipState.mutate(candidate.userid, candidate.shipno, (v) => {
        v.damage = v.damage + damage;
        v.lastfired = ship.channel ?? NO_CHANNEL;
        v.lastfiredBy = { channel: ship.channel ?? NO_CHANNEL, name: ship.shipname };
        v.cantexit = FIRETICKS;
        if (v.status === GESTAT_AUTO) v.cybmine = ship.channel ?? NO_CHANNEL;
      });

      const hitEvent: CombatHitEvent = {
        attackerId,
        victimId: shipKey(candidate.userid, candidate.shipno),
        // Tagged as its own weapon so the VICTIM is told which one hit them —
        // only the hyper-phaser reaches a ship at warp. @see GECMDS.C:1076
        weapon: 'hyper-phaser',
        damageHull: damage,
        damageShield: 0,
        sector: { x: sectorX, y: sectorY },
        tickAt,
      };
      this.events.emit(COMBAT_HIT, hitEvent);

      // @see GEFUNCS.C:randamage — called after every hyper-phaser hit (GECMDS.C:1082)
      applyRandamageAndEmit(this.random, this.events, this.shipClassCache, candidate, { x: sectorX, y: sectorY }, tickAt);

      this.combatTick?.recordCombatEvent({
        weapon: 'hyper-phaser',
        shooter: { x: ship.xcoord, y: ship.ycoord },
        target: { x: candidate.xcoord, y: candidate.ycoord },
        maxRange: scanRange / 10_000,
      });
      hits++;
      lines.push({
        // HPHITM — "Our Hyper-Phaser caused %s damage to Commander %s's ship!"
        // Damage as a damstr WORD, and the OWNER named, as canon does with
        // username(wptr). @see GECMDS.C:1074
        text: formatMessage(MessageId.HP_HIT_MINE, damstr(damage), displayName(candidate)),
        category: 'combat',
      });
    }

    if (hits === 0) {
      const missEvent: CombatMissEvent = {
        attackerId,
        weapon: 'phaser',
        sector: { x: sectorX, y: sectorY },
        tickAt,
      };
      this.events.emit(COMBAT_MISS, missEvent);
      lines.push({ text: 'Hyper-phaser fired — no targets in arc.', category: 'combat' });
    }

    return { lines };
  }
}
