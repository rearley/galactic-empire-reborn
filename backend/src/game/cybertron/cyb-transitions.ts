import type { Random } from '../combat/random.port';
import { GESTAT_AUTO } from '../constants';
import { CYBMINE_NONE } from '../ship/ship-channel.registry';

/**
 * Every change to a Cybertron's claim, one function per transition.
 *
 * WHY THIS EXISTS
 * ---------------
 * An AI's mode is not one field. It is `cybmine` (whom it has claimed) plus the
 * course, cadence and activation fields canon writes ALONGSIDE it, and canon
 * writes them together because together they are one state change. Written from
 * a dozen call sites, each site had to remember the whole set, and four in one
 * day did not (v0.27.4-v0.27.8): a claim released while the ship kept a combat
 * crawl, a claim restored across a restart onto a recycled channel, a cruise
 * speed restored only when it was zero. Each was "a canon block implemented in
 * part, where the missing part is the bug".
 *
 * So the set lives here, once per transition, beside the canon lines it mirrors,
 * and `test/invariants/cyb-claim-writes.spec.ts` fails on any write of `cybmine`
 * or `cybupdate` anywhere else. A new reason to drop a claim is a new function
 * in this file, not a new assignment in the tick.
 *
 * Each function mutates the ship it is given, as every caller already does, and
 * draws from `Random` in exactly the order the call site did before it moved:
 * reordering two draws changes gameplay and is invisible in review.
 *
 * Scope is the CLAIM. Steering that never touches it — the jammed drift,
 * `cyb_check_damage`, the `cyb_attack` evasion tail — stays in the tick.
 *
 * @see issue #59, docs/DECISIONS.md 2026-09-21
 */

/** The fields a claim transition may write. */
export interface CybClaimState {
  cybmine: number;
  speed2b: number;
  head2b: number;
  holdcourse: number;
  cybupdate: number;
  tick: number;
}

/** Warp 2 after a kill. @see GECYBS.C:818 `ptr->speed2b = 2000.0;` */
export const CYB_WON_SPEED = 2000;

/**
 * A hit turns an AI on whoever fired it, overriding whatever it was chasing and
 * the `noclaim` limit — canon's "sickum". Writes the claim and nothing else,
 * because canon writes nothing else: the next activation's pursuit band does
 * the steering. A player ship is left alone.
 * @see GECMDS.C:981 `wptr->cybmine = usrn;` (phaser)
 * @see GECMDS.C:1072 `wptr->cybmine = usrn;` (hyper-phaser)
 * @see GECMDS.C:1374 `wptr->cybmine = usrn;` (torpedo/missile)
 */
export function provoke(ai: { status: number; cybmine: number }, attackerChannel: number): void {
  if (ai.status === GESTAT_AUTO) ai.cybmine = attackerChannel;
}

/**
 * Claim the nearest eligible pilot. The claim only: the pursuit band that
 * follows sets speed and heading every activation, claimed or re-claimed.
 * @see GECYBS.C:740 `ptr->cybmine = (byte)low_ship;`
 */
export function acquire(ai: CybClaimState, channel: number): void {
  ai.cybmine = channel;
}

/**
 * The claimed pilot has left the game: drop them and cruise.
 * @see GECYBS.C:684 `if (!ingegame(zothusn))`
 * @see GECYBS.C:686 `ptr->cybmine = (byte)255;`
 * @see GECYBS.C:687 `ptr->speed2b = rndm(d_topspeed);`
 */
export function releaseTargetLeft(ai: CybClaimState, topSpeed: number, rng: Random): void {
  ai.cybmine = CYBMINE_NONE;
  ai.speed2b = rng.next() * topSpeed;
}

/**
 * The claimed pilot is cloaked: hold course a while at a cruise, and give up on
 * them one time in ten.
 * @see GECYBS.C:696 `ptr->holdcourse=gernd()%5+5;`
 * @see GECYBS.C:700 `ptr->cybmine = 255;`
 */
export function releaseTargetCloaked(ai: CybClaimState, topSpeed: number, rng: Random): void {
  ai.holdcourse = Math.floor(rng.next() * 5) + 5;
  ai.speed2b = rng.next() * topSpeed;
  if (Math.floor(rng.next() * 10) === 0) ai.cybmine = CYBMINE_NONE;
}

/**
 * PORT-ORIGINAL: the claimed pilot has flown into the neutral zone.
 *
 * The acquisition scan already refuses to LOCK a pilot inside (0,0), but a lock
 * taken outside it was never released, so a Cybertron that had claimed you
 * followed you onto the hub and shadowed you there. It cannot fire, because
 * canon's one neutral test is the hunter's own position,
 * GECYBS.C:251 `if (!neutral(&ptr->coord)`
 * so it sat on top of you, drifting out a sector and hyperwarping back in. Found in production as a
 * Sarten Obliterator holding station at (0.69, 0.53) with a live claim.
 *
 * Releasing the claim is not enough on its own. The speed the ship is holding is
 * a COMBAT speed — the close band assigns `rndm(500.0)` within half a sector of
 * its prey — so a bare release left it parked on the hub at a crawl, free to go
 * and far too slow to get anywhere: Cybrg-205 at (0.54, 0.29), claim cleared,
 * `speed2b` 284, after v0.27.5. So this also applies canon's idle re-roll:
 *
 *   GECYBS.C:473 `ptr->speed2b = rndm(d_topspeed);`
 *   GECYBS.C:474 `ptr->head2b = rndm(359.9);`
 *
 * One re-roll, held until the next `idleCadence` — not the per-activation
 * re-roll removed in v0.27.4, which was a random walk that went nowhere.
 * @see docs/DECISIONS.md 2026-09-20
 */
export function releaseZoneEntry(ai: CybClaimState, topSpeed: number, rng: Random): void {
  ai.cybmine = CYBMINE_NONE;
  ai.speed2b = rng.next() * topSpeed;
  ai.head2b = rng.next() * 359.9;
}

/**
 * A Cyberquad's "lucky day": it breaks off and runs at top speed. The caller
 * still evaluates fire on this pass, as canon falls through.
 * @see GECYBS.C:259 `ptr->cybmine = (byte)255;`
 * @see GECYBS.C:261 `ptr->speed2b = d_topspeed;`
 */
export function releaseBreakOff(ai: CybClaimState, topSpeed: number): void {
  ai.cybmine = CYBMINE_NONE;
  ai.speed2b = topSpeed;
}

/**
 * Nobody to hunt. Canon sets ONLY these two and lets the ship coast on whatever
 * course it already had:
 *
 *   GECYBS.C:735 `ptr->tick = 255;`
 *   GECYBS.C:736 `ptr->cybmine = 255;`
 *
 * This used to re-roll `speed2b` and `head2b` as well, citing the same lines,
 * which do not contain it. A fresh random heading on every activation is a random
 * walk with zero expected displacement, so a Cybertron with no target went nowhere
 * instead of leaving; paired with the old blind-in-the-zone rule it made the
 * origin an absorbing state. The course IS re-rolled, on canon's own cadence, by
 * `idleCadence`.
 */
export function releaseNoTarget(ai: CybClaimState): void {
  ai.tick = 255;
  ai.cybmine = CYBMINE_NONE;
}

/**
 * The claim names nobody the port can find. Canon's version is a claim on a
 * number past the terminal range; the port reaches it when the claimed channel
 * no longer resolves to an active pilot. The claim only.
 * @see GECYBS.C:678 `if (zothusn >= nterms)`
 */
export function releaseStale(ai: CybClaimState): void {
  ai.cybmine = CYBMINE_NONE;
}

/**
 * PORT-ORIGINAL: another ship killed the pilot this AI had claimed.
 *
 * Canon's `killem` calls only the KILLER's `won_func`,
 *   GEFUNCS.C:1113 `shipclass[wptr->shpclass].won_func(wptr,who,ptr);`
 * and leaves every other claim to lapse on its holder's next activation, through
 * the target-left branch. The port releases them at the kill, so they cannot
 * re-engage the pilot the moment they respawn. The claim only.
 */
export function releaseDeadTarget(ai: CybClaimState): void {
  ai.cybmine = CYBMINE_NONE;
}

/**
 * What a Cybertron does after it kills a pilot: release the claim, settle to
 * warp 2, and force the next persistence pass.
 *
 * Without it the claim cleared only incidentally, through the target-left branch
 * on the next activation, which assigns a RANDOM speed — so a Cybertron that had
 * just killed someone might tear off at top speed instead of easing off.
 * Invisible from the cockpit: you are dead at the moment it happens.
 * @see GECYBS.C:810 `cyb_won(ptr,usrn,wptr)`
 */
export function releaseWon(ai: CybClaimState): void {
  ai.cybmine = CYBMINE_NONE;
  ai.speed2b = CYB_WON_SPEED;
  ai.cybupdate = 0;
}

/**
 * The idle wander: every 100-200 activations an unclaimed Cybertron picks a new
 * course. A claimed one keeps the course its pursuit band set.
 * @see GECYBS.C:455 `db_update(ptr,usrn)`
 */
export function idleCadence(ai: CybClaimState, topSpeed: number, rng: Random): void {
  if (ai.cybupdate > 1) {
    ai.cybupdate--;
    return;
  }
  if (ai.cybupdate === 1) {
    if (ai.cybmine === CYBMINE_NONE) {
      ai.speed2b = rng.next() * topSpeed;
      ai.head2b = rng.next() * 359.9;
    }
    ai.cybupdate = 100 + Math.floor(rng.next() * 100);
  }
}

/**
 * A Cybertron loaded from the database becomes a fresh one: an AI, claiming
 * nobody, holding no course, at cruise.
 *
 * The claim must not survive the restart. `cybmine` stores a CHANNEL, channels
 * are session-scoped and recycled, and nothing writes them to the database, so
 * the number that meant "I am hunting Wasp" before the restart means whoever is
 * handed that number next. `holdcourse` goes with it: a stored countdown makes
 * the ship skip target selection for up to nine activations after boot.
 *
 * The cruise speed is restored UNCONDITIONALLY. It used to be guarded by
 * `speed2b === 0`, which only kick-started a stopped ship; everything else kept
 * whatever the process died holding, frequently a combat speed, and an
 * Obliterator came back from the v0.27.7 deploy crawling at 284 with no target.
 * No `topspeed > 0` guard either: canon has none, and the Base Star's `0 * 1000`
 * is exactly the speed an immobile fortress should have. Our topspeed is in warp
 * units where warp 1 = 1000.
 *
 *   GECYBS.C:131 `ptr->status = GESTAT_AUTO;`
 *   GECYBS.C:133 `ptr->cybmine = (byte)255;`
 *   GECYBS.C:134 `ptr->speed2b = (double)(ptr->topspeed)*500.0;`
 *   GECYBS.C:136 `ptr->holdcourse = 0;`
 *
 * Not written, deliberately and as recorded in DECISIONS, canon's
 *   GECYBS.C:132 `ptr->phasr = 100;`
 *   GECYBS.C:135 `ptr->cybupdate = 100 + gernd()%20;`
 *   GECYBS.C:137 `ptr->tick = CYBTICKTIME + gernd()%(CYBTICKTIME*5);`
 * — the last two are randomised and the repository takes no `Random` port.
 * @see docs/DECISIONS.md 2026-09-20 — a persisted `cybmine` named a channel
 */
export function hydrate(ai: CybClaimState & { status: number; topspeed: number }): void {
  ai.status = GESTAT_AUTO;
  ai.cybmine = CYBMINE_NONE;
  ai.holdcourse = 0;
  ai.speed2b = ai.topspeed * 1000;
}
