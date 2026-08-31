import { Inject, Injectable } from '@nestjs/common';
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
import { findShip } from '../helpers/find-ship';
import { FIRETICKS, MAXMISSL, MISENGFC, MISFACT, SE100DAM } from '../../constants';
import { I_MISSL } from '../../constants/items';

const MISSILE_CHARGE_MIN = 1;
const MISSILE_CHARGE_MAX = 50000;

/**
 * Handles `mis <target> <charge>` — launches a charged missile at a target.
 *
 * Missile slots live on the **target's** `lmissl[]` arrays (per
 * GECMDS.C:1191–1202). Unlike torpedoes, missiles can be fired at warp.
 *
 * Validations (mirror GECMDS.C:cmd_missl, GEFUNCS.C:firemiss):
 *   1. ShipClass.hasMissile === true   → else MIS_NOMIS
 *   2. charge ∈ [1, 50000]              → else NUMOOR(1, 50000)
 *   3. firer.jammer === 0               → else JAMMER4 (FR-017)
 *   4. firer.items[I_MISSL] > 0n        → else MIS_NOAMMO
 *   5. target found in scan range
 *   6. target has a free `lmissl` slot  → else MIS_FULL
 *
 * Side effects on success:
 *   target.lmisslChannel[slot]  = firer.channel
 *   target.lmisslDistance[slot] = floor(cdistance × 10000 + 20)
 *   target.lmisslEnergy[slot]   = charge
 *   firer.energy               -= charge / MISENGFC
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

    // Parse charge
    const chargeArg = args[1] ?? '';
    if (!/^-?\d+$/.test(chargeArg.trim())) {
      return {
        lines: [{ text: formatMessage(MessageId.NUMOOR, MISSILE_CHARGE_MIN, MISSILE_CHARGE_MAX), category: 'system' }],
      };
    }
    const charge = parseInt(chargeArg, 10);

    // 2. Charge range
    if (charge < MISSILE_CHARGE_MIN || charge > MISSILE_CHARGE_MAX) {
      return {
        lines: [{ text: formatMessage(MessageId.NUMOOR, MISSILE_CHARGE_MIN, MISSILE_CHARGE_MAX), category: 'system' }],
      };
    }

    // 3. Fire control damaged — GECMDS.C:1346-1351 lockon first check (C-010, Fix 1)
    if (ship.firecntl > 0) {
      return { lines: [{ text: formatMessage(MessageId.FCBROKE), category: 'system' }] };
    }

    // 3b. Jammer
    if (ship.jammer > 0) {
      return { lines: [{ text: formatMessage(MessageId.JAMMER4), category: 'system' }] };
    }

    // 4. Ammo
    const ammo = ship.items[I_MISSL] ?? 0n;
    if (ammo <= 0n) {
      return { lines: [{ text: formatMessage(MessageId.MIS_NOAMMO), category: 'system' }] };
    }

    // 4b. Neutral-zone self-zap (GECMDS.C:937 zaphim) — firer takes SE100DAM, no outgoing lock.
    if (isInNeutralZone(ship)) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.damage = s.damage + SE100DAM;
        s.cantexit = FIRETICKS;
      });
      return { lines: [{ text: formatMessage(MessageId.WPN_ZAP), category: 'combat' }] };
    }

    // 5. Target lookup
    const allShips = this.shipState.findAllShips();
    const scanRange = this.shipClassCache.getScanRange(ship.shpclass);
    const found = findShip(args[0] ?? '', ship, allShips, scanRange);
    if (!found.ok) {
      return { lines: [{ text: found.message, category: 'system' }] };
    }
    const target = found.ship;

    // Target in neutral zone ⇒ fire control refuses (GECMDS.C:1363).
    if (isInNeutralZone(target)) {
      return { lines: [{ text: formatMessage(MessageId.LOCK_NEUTRAL), category: 'system' }] };
    }
    // Fully cloaked target is unlockable (GECMDS.C:1371).
    if (target.cloak >= 10) {
      return { lines: [{ text: formatMessage(MessageId.LOCK_FAIL), category: 'system' }] };
    }
    // Lock-quality gate (GECMDS.C:1378-1395) — missile branch: (5 - dist)/MISFACT.
    const distSectors = cdistance(ship, target);
    const fact = lockFact('missile', ship.speed, target.speed, distSectors, MISFACT);
    if (fact <= 0.7) {
      return { lines: [{ text: formatMessage(MessageId.LOCK_FAIL), category: 'system' }] };
    }

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

    // Mutate firer — debit energy + ammo, set battle-lock.
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      s.energy = s.energy - charge / MISENGFC;
      s.items[I_MISSL] = (s.items[I_MISSL] ?? 0n) - 1n;
      s.cantexit = FIRETICKS;
    });

    return {
      lines: [
        {
          text: `Missile away — charge ${charge}, locked on ${target.shipname}.`,
          category: 'combat',
        },
      ],
    };
  }
}
