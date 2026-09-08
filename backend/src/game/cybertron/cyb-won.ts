/**
 * What a Cybertron does after it kills a pilot.
 *
 *   void FUNC cyb_won(ptr, usrn, wptr)
 *     ptr->cybmine   = (byte)255;
 *     ptr->speed2b   = 2000.0;
 *     ptr->cybupdate = 0;
 *   -- GECYBS.C
 *
 * The port incremented the killer's kill count and stopped there. The claim did
 * clear, but only incidentally: on the next tick the "target left the game"
 * branch fires and assigns a RANDOM speed. So canon's Cybertron settles
 * deliberately to warp 2 after a kill and ours picked anything up to its top
 * speed.
 *
 * This is invisible from the cockpit, which is why playtesting never found it —
 * you are dead at the moment it happens. It is only visible in what the AI does
 * next, to whoever arrives afterwards.
 */

/** `ptr->speed2b = 2000.0` — warp 2. */
export const CYB_WON_SPEED = 2000;

/** Canon's sentinel for "claiming nobody". */
const CYBMINE_NONE = 255;

/** Pure: the three fields cyb_won sets, applied to a copy. */
export function cybWon<T extends { cybmine: number; speed2b: number; cybupdate: number }>(
  ship: T,
): T {
  return { ...ship, cybmine: CYBMINE_NONE, speed2b: CYB_WON_SPEED, cybupdate: 0 };
}
