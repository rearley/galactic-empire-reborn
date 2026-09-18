import { Inject, Injectable } from '@nestjs/common';
import { ScanHandlerService } from './scan.handler';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { NO_CHANNEL } from '../../ship/ship-channel.registry';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { Random, RANDOM } from '../../combat/random.port';
import { cdistance, lockFact, missileFluxCost, missileFluxShort } from '../../combat/combat-math';
import { isInNeutralZone } from '../../combat/neutral-zone';
import { findShip, shipLetter } from '../helpers/find-ship';
import { CombatTargetWarningEvent } from '../../combat/combat-events';
import { applyLockOutcome, warnTarget } from '../../combat/lock-outcome';
import { FIRETICKS, MAXMISSL, MISENGFC, MISFACT, MISSILE_CHARGE_MAX, SE100DAM } from '../../constants';
import { I_MISSL } from '../../constants/items';
import { dropShieldsForFire } from '../../combat/shield-drop';

const MISSILE_CHARGE_MIN = 1;

/**
 * MISSHRT — the flux pile is too shallow for the requested charge.
 *
 * Not in messages.ts; defined here with its canon text, the way scan.handler
 * carries SCANWRM.
 *
 * @see GE/REL/MBMGEMSG.MSG:3735
 * @see GECMDS.C:1280-1285
 */
const MISSHRT = 'Sorry Sir! There is not that much energy in our neutron flux pile.';


/**
 * Handles `mis <target> <charge>` — launches a charged missile at a target.
 *
 * Missile slots live on the **target's** `lmissl[]` arrays (per
 * GECMDS.C:1191–1202). Unlike torpedoes, missiles can be fired at warp.
 *
 * Validations (mirror GECMDS.C:cmd_missl, GEFUNCS.C:firemiss):
 *   1. ShipClass.hasMissile === true   → else MIS_NOMIS
 *   2. charge in [1, 50000], else MISFMT — canon's own usage line, GECMDS.C:1272
 *   3. firer.jammer === 0               → else JAMMER4 (FR-017)
 *   4. firer.items[I_MISSL] > 0n        → else MIS_NOAMMO
 *   5. target found in scan range
 *   6. target has a free `lmissl` slot  → else MIS_FULL
 *
 * Side effects on success:
 *   target.lmisslChannel[slot]  = firer.channel
 *   target.lmisslDistance[slot] = floor(cdistance × 10000 + 20)
 *   target.lmisslEnergy[slot]   = charge
 *   firer.energy               -= trunc(charge / MISENGFC)
 *   firer.items[I_MISSL]       -= 1n
 *   firer.cantexit              = FIRETICKS
 *
 * @see GECMDS.C:cmd_missl
 * @see GEFUNCS.C:firemiss
 */
@Injectable()
export class MissileHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly shipClassCache: ShipClassCacheService,
    private readonly events: EventEmitter2,
    @Inject(RANDOM) private readonly random: Random,
    // Canon resolves a target by SCAN LETTER (GECMDS.C:1473-1487), so this
    // needs the table `sca` builds. @see ScanHandlerService.lettersFor
    private readonly scanHandler: ScanHandlerService,
  ) {
    void this.events;
    void this.random;
  }

  readonly command: Command = {
    keyword: 'mis',
    aliases: ['missl', 'missile'],
    minArgs: 2,
    argMissingMessage: formatMessage(MessageId.MIS_FMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult => {
      return this.handle(ship, args);
    },
  };

  /**
   * Canon's shared lockon tail: battle-lock BOTH ships and tell the target.
   * @see GECMDS.C:1395-1422
   */
  private applyLock(
    firer: ShipState, target: ShipState, kind: 'lock-acquired' | 'lock-attempt',
  ): void {
    applyLockOutcome(firer, target, kind, {
      shipState: this.shipState,
      events: this.events,
      lettersFor: (u, n) => this.scanHandler.lettersFor(u, n),
    });
  }

  /** One warning to the target, no lock side effects. @see GECMDS.C:1313 */
  private announce(
    firer: ShipState, target: ShipState, kind: CombatTargetWarningEvent['kind'],
  ): void {
    warnTarget(firer, target, kind, {
      events: this.events,
      lettersFor: (u, n) => this.scanHandler.lettersFor(u, n),
    });
  }

  private handle(ship: ShipState, args: string[]): CommandResult {
    // 1. Launcher mounted?
    let hasMissile = false;
    try {
      hasMissile = this.shipClassCache.getHasMissile(ship.shpclass);
    } catch {
      hasMissile = false;
    }
    if (!hasMissile) {
      return { lines: [{ text: formatMessage(MessageId.MIS_NOMIS), category: 'system' }] };
    }

    // 1b. Firer cloak gate — cannot fire while cloaked (mirrors torpedo, GECMDS.C:cmd_torpedo)
    if (ship.cloak > 0) {
      return { lines: [{ text: formatMessage(MessageId.MIS_CLOAK), category: 'system' }] };
    }

    // Both refusals are the command's OWN usage line. Canon tests the argument
    // twice and prints MISFMT each time, and `cmd_missl` never calls NUMOOR:
    //
    //   if (margv[2] == NULL || margc < 3) { prfmsg(MISFMT); ... return; }
    //   eng_long = atol(margv[2]);
    //   if (eng_long == 0 || eng_long > 50000L) { prfmsg(MISFMT); ... return; }
    //
    // @see GECMDS.C:1262 `prfmsg(MISFMT);`
    // @see GECMDS.C:1271 `prfmsg(MISFMT);`
    const chargeArg = args[1] ?? '';
    if (!/^-?\d+$/.test(chargeArg.trim())) {
      return { lines: [{ text: formatMessage(MessageId.MIS_FMT), category: 'system' }] };
    }
    const charge = parseInt(chargeArg, 10);

    if (charge < MISSILE_CHARGE_MIN || charge > MISSILE_CHARGE_MAX) {
      return { lines: [{ text: formatMessage(MessageId.MIS_FMT), category: 'system' }] };
    }

    // 3. Fire control damaged — GECMDS.C:1346-1351 lockon first check (C-010, Fix 1)
    if (ship.firecntl > 0) {
      return { lines: [{ text: formatMessage(MessageId.FCBROKE), category: 'system' }] };
    }

    // 3b. Jammer
    if (ship.jammer > 0) {
      return { lines: [{ text: formatMessage(MessageId.JAMMER4), category: 'system' }] };
    }

    // Shields drop BEFORE the ammo check. C is explicit about the ordering:
    // `if (shieldstat == SHIELDUP) shielddn(...)` at GECMDS.C:1240-1243, then
    // the NOMISSL bail at :1245-1250. So a dry fire still costs you your
    // shields. The port had no shield drop on this path at all — the only one
    // of the three weapons missing it — and the ammo check came first, which
    // would have hidden it even once added.
    const shieldLine = dropShieldsForFire(ship, (fn) =>
      this.shipState.mutate(ship.userid, ship.shipno, fn));

    // 4. Ammo
    const ammo = ship.items[I_MISSL] ?? 0n;
    if (ammo <= 0n) {
      return {
        lines: [
          ...(shieldLine ? [shieldLine] : []),
          { text: formatMessage(MessageId.MIS_NOAMMO), category: 'system' },
        ],
      };
    }

    // 4a. MISSHRT — the neutron flux pile. C computes the flux draw with
    // INTEGER division and gates on it before it ever looks for a target:
    //
    //   eng_flu = energy/misengfc;                                GECMDS.C:1278
    //   if (eng_flu > 0 && eng_flu >= (warsptr->energy+MOVENGMIN)) GECMDS.C:1280
    //       prfmsg(MISSHRT);
    //
    // The port had no gate at all here and billed the fractional quotient. Both
    // are fixed together: `fluxCost` below is the same value the debit uses, so
    // what you are refused for is exactly what you would have paid.
    const fluxCost = missileFluxCost(charge, MISENGFC);
    if (missileFluxShort(fluxCost, ship.energy)) {
      return {
        lines: [
          ...(shieldLine ? [shieldLine] : []),
          { text: MISSHRT, category: 'system' },
        ],
      };
    }

    // 5. Target lookup
    const allShips = this.shipState.findAllShips();
    const scanRange = this.shipClassCache.getScanRange(ship.shpclass);
    const letters = this.scanHandler.lettersFor(ship.userid, ship.shipno);
    const found = findShip(args[0] ?? '', ship, allShips, scanRange, letters);
    if (!found.ok) {
      return { lines: [{ text: found.message, category: 'system' }] };
    }
    const target = found.ship;

    // The self-zap needs a RESOLVED target: canon's `zaphim` sits inside the
    // `shpnum >= 0` arm, after `findshp` has produced a real ship. Testing the
    // zone before the lookup meant naming a ship that does not exist while
    // sitting at the origin cost a hundred points of hull, where canon just
    // says the scanners cannot locate it.
    // @see GECMDS.C:1297 `if (neutral(&warsptr->coord))`
    if (isInNeutralZone(ship)) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.damage = s.damage + SE100DAM;
        // Self-inflicted and attacker-less: without a cause the manifest read
        // `cause=unknown` for a pilot who shot themselves at the origin.
        // @see issue #54
        s.deathCause = { kind: 'neutral-zone', what: 'the neutral zone' };
        s.cantexit = FIRETICKS;
      });
      return {
        lines: [
          ...(shieldLine ? [shieldLine] : []),
          { text: formatMessage(MessageId.WPN_ZAP), category: 'combat' },
        ],
      };
    }

    // Target in neutral zone ⇒ fire control refuses (GECMDS.C:1363).
    if (isInNeutralZone(target)) {
      return { lines: [{ text: formatMessage(MessageId.LOCK_NEUTRAL), category: 'system' }] };
    }
    // Fully cloaked target is unlockable (GECMDS.C:1371).
    // Canon does not call this a failed lock — the guarded block at
    // GECMDS.C:1371 is never entered for a cloaked or out-of-range target, so
    // control falls to the else at 1426 and prints LOCK5, "cannot FIND ship
    // %c". LOCK3 ("cannot get a positive lock") is the different, later answer
    // for a target that is plainly visible but too fast or too far to hold.
    // The port returned the same string for both and lost that distinction.
    if (target.cloak >= 10) {
      const letter = shipLetter(letters, `${target.userid}:${target.shipno}`);
      return { lines: [{ text: formatMessage(MessageId.LOCK_UNREACHABLE, letter), category: 'system' }] };
    }
    // Lock-quality gate (GECMDS.C:1378-1395) — missile branch: (5 - dist)/MISFACT.
    const distSectors = cdistance(ship, target);
    const fact = lockFact('missile', ship.speed, target.speed, distSectors, MISFACT);
    if (fact <= 0.7) {
      const letter = shipLetter(letters, `${target.userid}:${target.shipno}`);
      // Canon's lockon pins BOTH ships and warns the target even when the lock
      // fails — the same tail `torp` gets, because canon has one lockon.
      // @see GECMDS.C:1413-1421
      this.applyLock(ship, target, 'lock-attempt');
      return { lines: [{ text: formatMessage(MessageId.LOCK_FAIL, letter), category: 'system' }] };
    }

    // Successful lock: warn and pin the target. LOCK1 (the firer's own
    // confirmation) is commented out in canon. @see GECMDS.C:1397-1407
    this.applyLock(ship, target, 'lock-acquired');

    // 6. Find lowest free slot on target's lmissl
    let slot = -1;
    for (let i = 0; i < MAXMISSL; i++) {
      const ch = target.lmisslChannel[i];
      if (ch === undefined || ch === 255) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      return { lines: [{ text: formatMessage(MessageId.MIS_FULL), category: 'system' }] };
    }

    const dist = Math.floor(cdistance(ship, target) * 10000 + 20);
    // The firer's unique channel (this port's usrnum), not its shipno: the
    // read side resolves the slot back to a ship by channel, and shipno is 1
    // for every player's first ship. @see GECMDS.C:1202, ShipChannelRegistry
    const firerChannel = ship.channel ?? NO_CHANNEL;

    // Mutate target — allocate slot.
    this.shipState.mutate(target.userid, target.shipno, (t) => {
      while (t.lmisslChannel.length <= slot) t.lmisslChannel.push(255);
      while (t.lmisslDistance.length <= slot) t.lmisslDistance.push(0);
      while (t.lmisslEnergy.length <= slot) t.lmisslEnergy.push(0);
      t.lmisslChannel[slot] = firerChannel;
      t.lmisslDistance[slot] = dist;
      t.lmisslEnergy[slot] = charge;
    });

    // The target is told the moment the tube empties:
    //   prfmsg(MFIRE2,shpltr(shpnum,usrn)); outprfge(FILTER,shpnum);
    // @see GECMDS.C:1313
    this.announce(ship, target, 'missile-launched');

    // Mutate firer — debit energy + ammo, set battle-lock.
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      // The truncated flux draw, not `charge / MISENGFC`. @see GECMDS.C:1278, :1314
      s.energy = s.energy - fluxCost;
      s.items[I_MISSL] = (s.items[I_MISSL] ?? 0n) - 1n;
      s.cantexit = FIRETICKS;
    });

    return {
      lines: [
        {
          // As with torpedoes: canon confirms the launch and nothing else.
          text: formatMessage(MessageId.MFIRE1).trim(),
          category: 'combat',
        },
      ],
    };
  }
}
