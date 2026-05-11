import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState, shipKey } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { Random, RANDOM } from '../../combat/random.port';
import {
  cdistance,
  lineOfFire,
  phaserDamage,
  shieldhit,
} from '../../combat/combat-math';
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
  HPBEAMW,
  PMINFIRE,
  WARP_THRESHOLD,
} from '../../constants';

/**
 * Handles `pha` / `phasor` — ship-to-ship phaser fire.
 *
 * Validations (mirror GECMDS.C:cmd_phasor):
 *   1. `phasrtype > 0` (phaser mounted) — else PHA_NOPHAS
 *   2. `phasr >= PMINFIRE` — else PHA_NOPOW
 *   3. bearing ∈ [0, 359] — else NUMOOR(0,359)
 *   4. percent ∈ [1, 100] — else NUMOOR(1,100)
 *   5. firer's `jammer > 0` — else JAMMER4 (FR-017)
 *
 * Hyper-phaser path: when the firer's `speed >= WARP_THRESHOLD` (warp), the
 * beam width is fixed at `HPBEAMW=5°` regardless of the percent argument.
 * Below warp, beam width equals the percent argument.
 *
 * For each ship in scan range (no team filter — friendly fire is allowed,
 * FR-005), `lineOfFire` decides hit; on hit `phaserDamage` → `shieldhit`
 * mutates `victim.shield` and `victim.damage` via `ShipStateService.mutate`.
 * Each victim's `lastfired` is set to the firer's `shipno` (channel) and
 * `cantexit` is set to FIRETICKS (FR-028a). The firer's `cantexit` is also
 * set to FIRETICKS, and `phasr` is debited by `(percent / 100) * maxPhaser`.
 *
 * Emits:
 *   - `combat.phaser-fired` once
 *   - `combat.hit` per victim hit
 *   - `combat.miss` once iff no victims hit
 *
 * @see GECMDS.C:cmd_phasor
 * @see GEFUNCS.C:firephas
 */
@Injectable()
export class PhaserHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly shipClassCache: ShipClassCacheService,
    private readonly events: EventEmitter2,
    @Inject(RANDOM) private readonly random: Random,
  ) {
    // random is reserved for future damage-roll integration (randamage).
    void this.random;
  }

  readonly command: Command = {
    keyword: 'pha',
    aliases: ['phasor'],
    minArgs: 2,
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

    // Parse args
    const bearingArg = args[0] ?? '';
    const percentArg = args[1] ?? '';
    if (!/^-?\d+$/.test(bearingArg.trim()) || !/^-?\d+$/.test(percentArg.trim())) {
      return { lines: [{ text: formatMessage(MessageId.PHA_FMT), category: 'system' }] };
    }
    const bearing = parseInt(bearingArg, 10);
    const percent = parseInt(percentArg, 10);

    // 3. Bearing in [0, 359]
    if (bearing < 0 || bearing > 359) {
      return { lines: [{ text: formatMessage(MessageId.NUMOOR, 0, 359), category: 'system' }] };
    }

    // 4. Percent in [1, 100]
    if (percent < 1 || percent > 100) {
      return { lines: [{ text: formatMessage(MessageId.NUMOOR, 1, 100), category: 'system' }] };
    }

    // 5. Jammer active on firer? (FR-017)
    if (ship.jammer > 0) {
      return { lines: [{ text: formatMessage(MessageId.JAMMER4), category: 'system' }] };
    }

    const maxPhaser = this.shipClassCache.getMaxPhaser(ship.shpclass);
    const scanRange = this.shipClassCache.getScanRange(ship.shpclass);
    const sectorX = Math.floor(ship.xcoord);
    const sectorY = Math.floor(ship.ycoord);
    const tickAt = new Date();
    const attackerId = shipKey(ship.userid, ship.shipno);

    // Hyper-phaser path?
    const hyper = ship.speed >= WARP_THRESHOLD;
    const beamWidth = hyper ? HPBEAMW : percent;
    // In hyper-phaser the phasor is fully discharged (100%); else by `percent`.
    const dischargePercent = hyper ? 100 : percent;

    // Emit fired event
    const firedEvent: CombatPhaserFiredEvent = {
      shipId: attackerId,
      bearing,
      percent,
      hyper,
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

      const range = cdistance(ship, candidate);
      // C-001 audit 022: phasers must not reach beyond the firer's scanner range.
      // Mirrors the implicit gate in C `pdamage` (damage falls to 0 at
      // `disfact = 20000 + phasrtype*4000`) — we use scanRange (cdistance × 10000)
      // as the canonical TS cap, matching every other weapon-target lookup
      // (see helpers/find-ship.ts).
      // @see GECMDS.C:946-1004 firep
      // @see GEFUNCS.C:2060-2092 pdamage
      // @see specs/022-fidelity-audit-v2/findings.md C-001
      if (range * 10000 > scanRange) continue;
      if (!lineOfFire(ship, candidate, bearing, beamWidth)) continue;

      const damage = phaserDamage(dischargePercent, range, maxPhaser);
      const shieldUp = candidate.shieldstat === 1 && candidate.shield > 0;
      let hullDamage = Math.floor(damage);
      let shieldConsumed = 0;

      if (shieldUp) {
        const r = shieldhit(candidate.shield, candidate.shieldtype, Math.floor(damage));
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

    // Debit firer
    const drained = (dischargePercent / 100) * maxPhaser;
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.phasr = s.phasr - drained;
      s.cantexit = FIRETICKS;
    });

    return { lines };
  }
}
