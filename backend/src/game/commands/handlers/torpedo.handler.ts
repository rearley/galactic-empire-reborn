import { Inject, Injectable } from '@nestjs/common';
import { ScanHandlerService } from './scan.handler';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState, shipKey } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { NO_CHANNEL } from '../../ship/ship-channel.registry';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { Random, RANDOM } from '../../combat/random.port';
import { cdistance, lockFact } from '../../combat/combat-math';
import { isInNeutralZone } from '../../combat/neutral-zone';
import { findShip, shipLetter } from '../helpers/find-ship';
import { CombatTargetWarningEvent } from '../../combat/combat-events';
import { applyLockOutcome, warnTarget } from '../../combat/lock-outcome';
import { FIRETICKS, MAXTORPS, SE100DAM, TORFACT, WHERE_HYPERSPACE } from '../../constants';
import { I_TORP } from '../../constants/items';
import { dropShieldsForFire } from '../../combat/shield-drop';

/**
 * Handles `tor <target>` — locks a torpedo onto a target ship.
 *
 * Torpedo slots live on the **target's** `ltorps[]` arrays (per
 * GECMDS.C:1191–1202): firing allocates the lowest free slot on the
 * target; the projectile-travel pass in CombatTickService walks each
 * ship's own incoming arrays and resolves hits or decoy intercepts.
 *
 * Validations (mirror GECMDS.C:cmd_torpedo, GECMDS.C:torp 1178–1206):
 *   1. ShipClass.hasTorpedo === true → else TOR_NOTOR
 *   2. firer.where !== hyperspace    → else TOR_HYPERSPACE (canon TORP2)
 *   3. firer.cloak === 0             → else TOR_CLOAK
 *   4. firer.items[I_TORP] > 0n      → else TOR_NOAMMO
 *   5. firer.jammer === 0            → else JAMMER4 (FR-017)
 *   6. target found in scan range
 *   7. target has a free `ltorps` slot → else TOR_FULL
 *
 * Side effects on success:
 *   target.ltorpsChannel[slot]  = firer.channel
 *   target.ltorpsDistance[slot] = floor(cdistance × 10000 + 20)
 *   firer.items[I_TORP]        -= 1n
 *   firer.shieldstat            = 0   (shields auto-lower)
 *   firer.cantexit              = FIRETICKS
 *
 * @see GECMDS.C:cmd_torpedo
 * @see GECMDS.C:torp 1178-1206
 * @see GEFUNCS.C:firetorp
 */
@Injectable()
export class TorpedoHandlerService {
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
    keyword: 'tor',
    aliases: ['torp', 'torpedo'],
    minArgs: 1,
    argMissingMessage: formatMessage(MessageId.TOR_FMT),
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

  /** One warning to the target, no lock side effects. @see GECMDS.C:1198 */
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
    let hasTorpedo = false;
    try {
      hasTorpedo = this.shipClassCache.getHasTorpedo(ship.shpclass);
    } catch {
      hasTorpedo = false;
    }
    if (!hasTorpedo) {
      return { lines: [{ text: formatMessage(MessageId.TOR_NOTOR), category: 'system' }] };
    }

    // 2. Hyperspace gate — `if (warsptr->where == 1) prfmsg(TORP2)`, "That
    // would simply waste a torpedo in hyperspace Sir!" (GECMDS.C:1118).
    //
    // This used to gate on the firer's SPEED and show the same message, which
    // invented a rule canon does not have and hid the one it does. Canon puts
    // NO gate on the firer's speed; it prices speed into the lock instead
    // (see the lock-quality gate below), so warp 1 still reaches 2.2 sectors.
    // The rule about warp is on the TARGET: `if (wptr->speed > 999) fact = 0`.
    if (ship.where === WHERE_HYPERSPACE) {
      return { lines: [{ text: formatMessage(MessageId.TOR_HYPERSPACE), category: 'system' }] };
    }

    // 3. Cloak gate
    if (ship.cloak > 0) {
      return { lines: [{ text: formatMessage(MessageId.TOR_CLOAK), category: 'system' }] };
    }

    // 4. Ammo
    const ammo = ship.items[I_TORP] ?? 0n;
    if (ammo <= 0n) {
      return { lines: [{ text: formatMessage(MessageId.TOR_NOAMMO), category: 'system' }] };
    }

    // 5. Fire control damaged — GECMDS.C:1346-1351 lockon first check (C-010, Fix 1)
    if (ship.firecntl > 0) {
      return { lines: [{ text: formatMessage(MessageId.FCBROKE), category: 'system' }] };
    }

    // 5b. Jammer
    if (ship.jammer > 0) {
      return { lines: [{ text: formatMessage(MessageId.JAMMER4), category: 'system' }] };
    }

    // 6. Target lookup
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
    // @see GECMDS.C:1159 `if (neutral(&warsptr->coord))`
    if (isInNeutralZone(ship)) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.damage = s.damage + SE100DAM;
        // Self-inflicted and attacker-less: without a cause the manifest read
        // `cause=unknown` for a pilot who shot themselves at the origin.
        // @see issue #54
        s.deathCause = { kind: 'neutral-zone', what: 'the neutral zone' };
        s.cantexit = FIRETICKS;
      });
      return { lines: [{ text: formatMessage(MessageId.WPN_ZAP), category: 'combat' }] };
    }

    // Target in neutral zone ⇒ fire control refuses (GECMDS.C:1363).
    if (isInNeutralZone(target)) {
      return { lines: [{ text: formatMessage(MessageId.LOCK_NEUTRAL), category: 'system' }] };
    }
    // C source locks only when target cloak < 10; we reject when cloak >= 10 (fully cloaked = unlockable). @see GECMDS.C:1371
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
    // Lock-quality gate (GECMDS.C:1378-1395).
    const distSectors = cdistance(ship, target);
    const fact = lockFact('torpedo', ship.speed, target.speed, distSectors, TORFACT);
    if (fact <= 0.7) {
      const letter = shipLetter(letters, `${target.userid}:${target.shipno}`);
      // Canon pins BOTH ships even when the lock fails, and tells the target it
      // was attempted — a failed lock is how a stalker gives themselves away.
      // @see GECMDS.C:1413-1421
      this.applyLock(ship, target, 'lock-attempt');
      return { lines: [{ text: formatMessage(MessageId.LOCK_FAIL, letter), category: 'system' }] };
    }

    // Successful lock: the TARGET is told and pinned. Canon's LOCK1 — the
    // firer's own confirmation — is commented out in the original, so the firer
    // gets nothing extra here. @see GECMDS.C:1397-1407
    this.applyLock(ship, target, 'lock-acquired');

    // 7. Find lowest free slot on target's ltorps
    let slot = -1;
    for (let i = 0; i < MAXTORPS; i++) {
      const ch = target.ltorpsChannel[i];
      if (ch === undefined || ch === 255) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      return { lines: [{ text: formatMessage(MessageId.TOR_FULL), category: 'system' }] };
    }

    const dist = Math.floor(cdistance(ship, target) * 10000 + 20);
    // The firer's unique channel (this port's usrnum), not its shipno: the
    // read side resolves the slot back to a ship by channel, and shipno is 1
    // for every player's first ship. @see GECMDS.C:1202, ShipChannelRegistry
    const firerChannel = ship.channel ?? NO_CHANNEL;

    // Mutate target — allocate slot
    this.shipState.mutate(target.userid, target.shipno, (t) => {
      // Pad arrays if needed.
      while (t.ltorpsChannel.length <= slot) t.ltorpsChannel.push(255);
      while (t.ltorpsDistance.length <= slot) t.ltorpsDistance.push(0);
      t.ltorpsChannel[slot] = firerChannel;
      t.ltorpsDistance[slot] = dist;
    });

    // The target is told the moment the tube empties:
    //   prfmsg(TFIRE2,shpltr(shpnum,usrn)); outprfge(FILTER,shpnum);
    // @see GECMDS.C:1198-1199
    this.announce(ship, target, 'torpedo-launched');

    // Shields drop, and the pilot is TOLD. C calls shielddn at GECMDS.C:1130,
    // and shielddn prints SHLDDN (GEFUNCS.C:2419-2427). The port dropped them
    // silently here, so a pilot who fired a torpedo was unshielded without any
    // indication.
    const shieldLine = dropShieldsForFire(ship, (fn) =>
      this.shipState.mutate(ship.userid, ship.shipno, fn));

    // Mutate firer — decrement ammo, set battle-lock. Shields stay DOWN:
    // canon's help is explicit that they "WILL NOT be automatically raised
    // after the firing" (HLPSHI), and that cost is the design.
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.items[I_TORP] = (s.items[I_TORP] ?? 0n) - 1n;
      s.cantexit = FIRETICKS;
    });

    return {
      lines: [
        ...(shieldLine ? [shieldLine] : []),
        {
          // canon tells the firer only that it fired (GECMDS.C TFIRE1); it has no
          // lock-confirmation message at all. Ours named the target, which was
          // more informative and not canon. @see docs/DECISIONS.md 2026-09-05
          text: formatMessage(MessageId.TFIRE1).trim(),
          category: 'combat',
        },
      ],
    };
  }
}
