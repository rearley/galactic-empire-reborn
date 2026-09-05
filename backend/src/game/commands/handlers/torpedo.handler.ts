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
import { cdistance, lockFact } from '../../combat/combat-math';
import { isInNeutralZone } from '../../combat/neutral-zone';
import { findShip, shipLetter } from '../helpers/find-ship';
import { FIRETICKS, MAXTORPS, SE100DAM, TORFACT, WARP_THRESHOLD } from '../../constants';
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
 *   2. firer.speed < WARP_THRESHOLD  → else TOR_WARP
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

    // 2. Warp gate
    if (ship.speed >= WARP_THRESHOLD) {
      return { lines: [{ text: formatMessage(MessageId.TOR_WARP), category: 'system' }] };
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

    // 5c. Neutral-zone self-zap (GECMDS.C:937 zaphim) — firer takes SE100DAM, no outgoing lock.
    if (isInNeutralZone(ship)) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.damage = s.damage + SE100DAM;
        s.cantexit = FIRETICKS;
      });
      return { lines: [{ text: formatMessage(MessageId.WPN_ZAP), category: 'combat' }] };
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
      return { lines: [{ text: formatMessage(MessageId.LOCK_FAIL, letter), category: 'system' }] };
    }

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

    // Shields drop, and the pilot is TOLD. C calls shielddn at GECMDS.C:1130,
    // and shielddn prints SHLDDN (GEFUNCS.C:2419-2427). The port dropped them
    // silently here, so a pilot who fired a torpedo was unshielded without any
    // indication.
    const shieldLine = dropShieldsForFire(ship, (fn) =>
      this.shipState.mutate(ship.userid, ship.shipno, fn));

    // Mutate firer — decrement ammo, set battle-lock.
    // recentlySelfFiredTorp triggers auto-shield raise on next SHIP_UPDATE tick (T024).
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.items[I_TORP] = (s.items[I_TORP] ?? 0n) - 1n;
      s.cantexit = FIRETICKS;
      s.recentlySelfFiredTorp = true;
    });

    return {
      lines: [
        ...(shieldLine ? [shieldLine] : []),
        {
          text: `Torpedo away — locked on ${target.shipname}.`,
          category: 'combat',
        },
      ],
    };
  }
}
