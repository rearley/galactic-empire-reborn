import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { DECOYTIME, MAXDECOY } from '../../constants';
import { I_DECOY } from '../../constants/items';

/**
 * DECOY1 — refused in hyperspace. @see GE/REL/MBMGEMSG.MSG:2745, GECMDS.C:1552-1557
 */
/** @see GE/REL/MBMGEMSG.MSG DECOY0 — this hull has no decoy launcher */
const DECOY0 = "We don't have a decoy system on this tub, Sir!";

const DECOY1 = 'We would simply waste the decoy while in hyperspace Sir!';
/**
 * PCLOKUP — the blanket "not while cloaked" refusal, shared by every launch
 * command. @see GE/REL/MBMGEMSG.MSG:2155, GECMDS.C:1559-1564
 */
const PCLOKUP = 'We cannot do that while the cloaking device is on, Sir!';
/**
 * DECMANY — all ten slots are already occupied.
 * @see GE/REL/MBMGEMSG.MSG:2737, GECMDS.C:1584-1585
 */
const DECMANY = 'We already have 10 decoy ships out Sir!';

/**
 * Handles `dec` — deploys a decoy in the lowest free `decout[]` slot.
 *
 * Validations, in C's order (GECMDS.C:1545-1585):
 *   1. shipclass.has_decoy      → else DECOY0   (NOT implemented here — see below)
 *   2. ship.where === 1         → else DECOY1
 *   3. ship.cloak === 0         → else PCLOKUP
 *   4. items[I_DECOY] > 0n      → else DEC_NOAMMO (NODECOYS)
 *   5. a free slot below MAXDECOY → else DECMANY
 *
 * (1) is absent: the class flag lives in ShipClassCacheService, which this
 * handler does not inject, and adding a constructor dependency was out of scope
 * for the pass that added (2), (3) and (5). Every class that carries decoys as
 * cargo can currently launch them.
 *
 * Side effects on success:
 *   ship.decout[i] = DECOYTIME for the lowest i where decout[i] === 0/undefined
 *   ship.items[I_DECOY] -= 1n
 *
 * @see GECMDS.C:1538-1586 cmd_decoy
 */
@Injectable()
export class DecoyHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly shipClassCache: ShipClassCacheService,
  ) {}

  readonly command: Command = {
    keyword: 'dec',
    aliases: ['decoy'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, _args: string[], _ctx: CommandContext): CommandResult => {
      return this.handle(ship);
    },
  };

  private handle(ship: ShipState): CommandResult {
    // No launcher on this hull. This is the FIRST thing cmd_decoy checks —
    // `if (!shipclass[warsptr->shpclass].has_decoy) { prfmsg(DECOY0); return; }`
    // (GECMDS.C:1545-1550) — and it was missing, so any class that happened to
    // be carrying decoys as cargo could fire them.
    if (!this.shipClassCache.getHasDecoy(ship.shpclass)) {
      return { lines: [{ text: DECOY0, category: 'system' }] };
    }

    // Hyperspace. `where == 1` is the hyperspace flag (>= 10 is orbit), and C
    // refuses outright rather than wasting the decoy. @see GECMDS.C:1552-1557
    if (ship.where === 1) {
      return { lines: [{ text: DECOY1, category: 'system' }] };
    }

    // Cloaked. @see GECMDS.C:1559-1564
    if (ship.cloak > 0) {
      return { lines: [{ text: PCLOKUP, category: 'system' }] };
    }

    const ammo = ship.items[I_DECOY] ?? 0n;
    if (ammo <= 0n) {
      return { lines: [{ text: formatMessage(MessageId.DEC_NOAMMO), category: 'system' }] };
    }

    // `for (i=0; i<10; ++i)` — the slot search is bounded by MAXDECOY, and
    // falling off the end prints DECMANY. The port used to append past the end
    // of `decout` instead, so a pilot with cargo could keep launching for ever
    // and the decoy-intercept loop had more than ten chances to eat a torpedo.
    // @see GECMDS.C:1573-1585
    let slot = -1;
    for (let i = 0; i < MAXDECOY; i++) {
      if ((ship.decout[i] ?? 0) === 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      return { lines: [{ text: DECMANY, category: 'system' }] };
    }

    const targetSlot = slot;
    this.shipState.mutate(ship.userid, ship.shipno, (s) => {
      while (s.decout.length <= targetSlot) s.decout.push(0);
      s.decout[targetSlot] = DECOYTIME;
      s.items[I_DECOY] = (s.items[I_DECOY] ?? 0n) - 1n;
    });

    return {
      lines: [{ text: formatMessage(MessageId.DEC_DEPLOYED), category: 'combat' }],
    };
  }
}
