import { ShipState } from '../ship/ship-state.types';
import { formatMessage, MessageId } from '../commands/messages';
import { CommandResult } from '../commands/command.types';

/**
 * Drop the firer's shields, as every weapon command does before it fires.
 *
 *   if (ptr->shieldstat == SHIELDUP) shielddn(ptr,usrn);
 *                                       GECMDS.C:930-933 firep
 *                                       GECMDS.C:1130    cmd_torp
 *                                       GECMDS.C:1243    cmd_missl
 *
 * and `shielddn` itself (GEFUNCS.C:2419-2427) prints SHLDDN *then* clears the
 * flag.
 *
 * TWO things about this were wrong in the port and both mattered.
 *
 * ORDERING. C drops shields FIRST — before the PMINFIRE charge gate at
 * GECMDS.C:935 and before the neutral-zone `zaphim` return at :937-941. So
 * firing costs you your shields even when the shot never leaves the ship. The
 * port dropped them last, bundled with the discharge, so the neutral-zone path
 * returned before ever reaching it and a pilot could fire in the hub with
 * shields intact.
 *
 * SILENCE. Nothing printed SHLDDN. A pilot who fired once was unshielded for
 * the rest of the engagement and had no way to know: `rep sys` was the only
 * tell, and nothing prompts you to check it. Combined with shields also
 * dropping silently at warp, this is how a new player dies without ever
 * learning why.
 *
 * Returns the line to show, or null if the shields were already down — C only
 * calls shielddn when `shieldstat == SHIELDUP`, and announcing it otherwise is
 * noise.
 */
export function dropShieldsForFire(
  ship: ShipState,
  mutate: (fn: (s: ShipState) => void) => void,
): CommandResult['lines'][number] | null {
  if (ship.shieldstat !== 1) return null;
  mutate((s) => {
    s.shieldstat = 0;
  });
  return { text: formatMessage(MessageId.SHLDDN), category: 'combat' };
}
