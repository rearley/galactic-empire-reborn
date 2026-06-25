import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState, shipKey } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { Random, RANDOM } from '../../combat/random.port';
import {
  cdistance,
  inScanRange,
  lineOfFire,
  phaserDamage,
  shieldhit,
} from '../../combat/combat-math';
import { isInNeutralZone } from '../../combat/neutral-zone';
import {
  COMBAT_HIT,
  COMBAT_MISS,
  COMBAT_PHASER_FIRED,
  CombatHitEvent,
  CombatMissEvent,
  CombatPhaserFiredEvent,
} from '../../combat/combat-events';
import {
  FIRETICKS,
  PHATOWRP,
  PMINFIRE,
  SE100DAM,
  WARP_THRESHOLD,
} from '../../constants';
import { CombatTickService } from '../../combat/combat-tick.service';

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
 *      firer takes SE100DAM hull damage, phasr → 0, no outgoing damage.
 *
 * Per victim (GECMDS.C:946-1004): a victim at warp is unreachable unless
 * `phasrtype >= PHATOWRP` (949); victims inside the neutral zone are immune
 * (951); the candidate must be in scan range (C-001) and within the firing
 * arc. Damage comes from `phaserDamage(...)` (integer) and is applied through
 * raised shields via `shieldhit`, else straight to hull. Each hit victim and
 * the firer get `cantexit = FIRETICKS`.
 *
 * Note: the hyper-phaser path (firer at warp) is Plan 3 / C-009. For Plan 1
 * the firer simply fires the normal beam regardless of its own speed.
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
  ) {
    // random is reserved for future damage-roll integration (randamage).
    void this.random;
  }

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

    // 2. Charged?
    if (ship.phasr < PMINFIRE) {
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

    const scanRange = this.shipClassCache.getScanRange(ship.shpclass);
    const sectorX = Math.floor(ship.xcoord);
    const sectorY = Math.floor(ship.ycoord);
    const tickAt = new Date();
    const attackerId = shipKey(ship.userid, ship.shipno);

    // Current phaser charge feeds the damage formula (phasr/100 scaling).
    const phasrCharge = ship.phasr;

    // 6. Neutral-zone self-zap (GECMDS.C:937-941 zaphim): firer backfires.
    // This must execute BEFORE emitting COMBAT_PHASER_FIRED so that no fired
    // event leaks when the beam never actually leaves the ship.
    if (isInNeutralZone(ship)) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.damage = s.damage + SE100DAM;
        s.phasr = 0;
        s.cantexit = FIRETICKS;
      });
      return { lines: [{ text: formatMessage(MessageId.WPN_ZAP), category: 'combat' }] };
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

    for (const candidate of allShips) {
      // Skip self
      if (candidate.userid === ship.userid && candidate.shipno === ship.shipno) continue;
      // Skip not ingame
      if (candidate.status !== 1 && candidate.status !== 2) continue;

      const victimAtWarp = candidate.speed >= WARP_THRESHOLD;
      // Victim-at-warp gate: only hit a warping victim if phasrtype >= PHATOWRP (GECMDS.C:949).
      if (victimAtWarp && ship.phasrtype < PHATOWRP) continue;
      // Victims inside the neutral zone are immune (GECMDS.C:951).
      if (isInNeutralZone(candidate)) continue;
      // C-001 audit 022: phasers must not reach beyond the firer's scanner range.
      // @see GECMDS.C:946-1004 firep  @see specs/022-fidelity-audit-v2/findings.md C-001
      if (!inScanRange(ship, candidate, scanRange)) continue;
      if (!lineOfFire(ship, candidate, degree, focus)) continue;

      const distRaw = cdistance(ship, candidate) * 10000;
      const damage = phaserDamage({
        phasrtype: ship.phasrtype,
        phasr: phasrCharge,
        distRaw,
        focus,
        victimMaxTons: this.shipClassCache.getMaxTons(candidate.shpclass),
        victimAtWarp,
      });
      // C: `if (damage >= 1)` gates the hit.
      if (damage < 1) continue;

      const shieldUp = candidate.shieldstat === 1 && candidate.shield > 0;
      let hullDamage = damage;
      let shieldConsumed = 0;

      if (shieldUp) {
        const r = shieldhit(candidate.shield, candidate.shieldtype, damage);
        this.shipState.mutate(candidate.userid, candidate.shipno, (v) => {
          v.shield = r.newCharge;
          if (r.knockedDown) v.shieldstat = 0;
          v.lastfired = ship.shipno;
          v.cantexit = FIRETICKS;
        });
        hullDamage = 0;
        shieldConsumed = r.shieldConsumed;
      } else {
        this.shipState.mutate(candidate.userid, candidate.shipno, (v) => {
          v.damage = v.damage + hullDamage;
          v.lastfired = ship.shipno;
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
      lines.push({
        text: `Phaser hit on ${candidate.shipname}: shield -${shieldConsumed}, hull -${hullDamage}.`,
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
      lines.push({ text: 'Phasers fired — no targets in arc.', category: 'combat' });
    }

    // Full discharge of the firer (GECMDS.C:1006).
    // C-008: firer's shields drop for the battle-lock window — mirrors C `shielddn`
    // called before fire in GECMDS.C:firep 930-933. No auto-raise flag exists for
    // phaser (unlike `recentlySelfFiredTorp` for torpedoes), so re-raise is manual.
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.phasr = 0;
      s.cantexit = FIRETICKS;
      s.shieldstat = 0;
    });

    return { lines };
  }
}
