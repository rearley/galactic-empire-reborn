import { Command, CommandResult, CommandContext } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { valpcnt, valdegree } from '../validators';
import { ShipState } from '../../ship/ship-state.types';
import { resolveEngineCourse } from './helpers/engine-course';
import { cdistance } from '../../combat/combat-math';
import { cbearing } from '../../physics/physics-math';

/**
 * Canon strings this handler needs that `messages.ts` does not carry faithfully.
 *
 * `MessageId.IMPULSE1` exists but reads "You cannot use impulse engines in
 * hyperspace." — a paraphrase. The shipped table's wording is below.
 * `CLOK3` has no MessageId at all. Both are declared locally rather than added
 * to `messages.ts`, following the SCANWRM precedent in scan.handler.ts.
 *
 * @see GE/REL/MBMGEMSG.MSG:2900  IMPULSE1
 * @see GE/REL/MBMGEMSG.MSG:2390-2392  CLOK3 ("*** NEW IN REL 3.2c.5 ***")
 */
export const IMPULSE1 = 'Sorry Sir! Impulse drives would be useless in Hyperspace!';
export const CLOK3 = 'Sensors indicate some background ion field displacement bearing %d, Sir!';

/** A ship that might pick the ion trail up. */
export interface IonTrailObserver {
  userid: string;
  shipno: number;
  xcoord: number;
  ycoord: number;
  heading: number;
  /** Non-zero = jammed; canon skips them outright. @see GECMDS.C:536 */
  jammer: number;
  /** The observer's CLASS scan range, in raw units (cdistance x 10_000). */
  scanrange: number;
}

/** One CLOK3 delivery: who hears it, and what it says. */
export interface IonTrailReport {
  userid: string;
  shipno: number;
  bearing: number;
  text: string;
}

/** The two GELIB.C generators, injectable so the trail is testable. */
export interface IonTrailRng {
  /** GELIB.C:122 `rndm(mod)` — uniform double in [0, mod). */
  rndm(mod: number): number;
  /** GELIB.C:112 `gernd()` — raw `rand()`. */
  gernd(): number;
}

const defaultRng: IonTrailRng = {
  rndm: (mod: number) => Math.random() * mod,
  gernd: () => Math.floor(Math.random() * 0x8000),
};

/**
 * CLOK3 — the ion trail a cloaked ship leaves when it opens the throttle.
 *
 *     if (warsptr->cloak == 10 && warsptr->speed2b > (rndm(200.0)+10.0))
 *       for (zothusn=0 ; zothusn < nterms ; zothusn++)
 *         if (ingegame(zothusn) && zothusn != usrnum)
 *           ddist = cdistance(&warsptr->coord,&wptr->coord) * 10000;
 *           if (ddist < (shipclass[wptr->shpclass].scanrange/2) && wptr->jammer == 0)
 *             bearing = (int)(cbearing(&wptr->coord,&warsptr->coord,wptr->heading)+.5);
 *             bearing = bearing + (gernd()%20)-10;
 *             prfmsg(CLOK3,bearing); outprfge(ALWAYS,zothusn);
 *
 * Four things are load-bearing here, and all four are survival-relevant:
 *
 *  1. **Only a fully-charged cloak leaks.** `cloak == 10`, not `> 0`. The 1→2→10
 *     ramp (GEFUNCS.C:1717-1724) is silent; you start bleeding position only
 *     once you are actually invisible.
 *  2. **The threshold is a fresh roll each order**, in [10, 210). Below `imp 2`
 *     you never leak; from `imp 21` up you always do. One roll for the whole
 *     sweep, not one per observer — so it is all-or-nothing, and a cloaked ship
 *     is never partially detected.
 *  3. **The audience is every captain in the game inside HALF of THEIR OWN
 *     class's scan range** — not the sector, and not the cloaked pilot. A big
 *     hull with long-range sensors hears things a starter never will, and the
 *     cloaked captain gets no warning that they were heard.
 *  4. **A jammer deafens you to it.** `wptr->jammer == 0` — running your own
 *     jammer costs you the one clue a cloaked hunter gives away.
 *
 * The bearing is taken FROM the observer TO the cloaked ship, relative to the
 * OBSERVER's heading, then slopped by `gernd()%20 - 10` — i.e. -10..+9 degrees,
 * biased one degree to port. That asymmetry is the original's; the comment says
 * "+- 10" and the code does not deliver it. It is a plain off-by-one in a
 * flavour value with no gameplay consequence, and it is reproduced rather than
 * corrected so the number distribution matches canon exactly.
 *
 * @see GECMDS.C:524-546 cmd_impulse
 * @see GELIB.C:142-166 cbearing — signed -180..180
 * @see GE/REL/MBMGEMSG.MSG:2390-2392 CLOK3
 */
export function cloakIonTrailReports(
  mover: { userid: string; shipno: number; xcoord: number; ycoord: number; cloak: number; speed2b: number },
  observers: readonly IonTrailObserver[],
  rng: IonTrailRng = defaultRng,
): IonTrailReport[] {
  // `cloak == 10` exactly — a ramping or shot-out cloak leaves no trail.
  if (mover.cloak !== 10) return [];
  // One roll for the whole sweep (C evaluates rndm once, in the `if`).
  if (!(mover.speed2b > rng.rndm(200.0) + 10.0)) return [];

  const reports: IonTrailReport[] = [];
  for (const obs of observers) {
    if (obs.userid === mover.userid && obs.shipno === mover.shipno) continue;
    if (obs.jammer !== 0) continue;
    const ddist = cdistance(obs, mover) * 10_000;
    // Strict `<`, and half the OBSERVER's scan range.
    if (!(ddist < obs.scanrange / 2)) continue;

    // C: (int)(x + .5) — truncation toward zero, not Math.round.
    const exact = Math.trunc(cbearing(obs, mover, obs.heading) + 0.5);
    const bearing = exact + ((rng.gernd() % 20) - 10);
    reports.push({
      userid: obs.userid,
      shipno: obs.shipno,
      bearing,
      text: CLOK3.replace('%d', String(bearing)),
    });
  }
  return reports;
}

/**
 * Registration seam for the ion trail's audience.
 *
 * `impulseCommand` is a plain `Command` const, not an injectable service, so it
 * has no `ShipStateService` to enumerate `nterms` with and no ship-class table
 * to read `scanrange` from. Rather than reshape the command (and the module
 * that registers it), the handler asks whatever the app installed here. When
 * nothing is installed the trail is simply not emitted, which is what the port
 * did before this change.
 */
let ionTrailObservers: ((mover: ShipState) => IonTrailObserver[]) | null = null;

/**
 * Build the observer list canon sweeps: every OTHER ship in the game, each
 * carrying its OWN class's scan range.
 *
 * `for (zothusn=0 ; zothusn < nterms ; zothusn++) if (ingegame(zothusn) &&
 * zothusn != usrnum)` — the whole game, not the sector — and the range test is
 * `shipclass[wptr->shpclass].scanrange`, indexed by the OBSERVER's class, not
 * the cloaked ship's. @see GECMDS.C:530-537
 *
 * Exported so the wiring is testable without standing up the Nest module.
 */
export function ionTrailObserversFrom(
  ships: readonly ShipState[],
  getScanRange: (shpclass: number) => number,
  mover: Pick<ShipState, 'userid' | 'shipno'>,
): IonTrailObserver[] {
  return ships
    .filter((s) => !(s.userid === mover.userid && s.shipno === mover.shipno))
    .map((s) => ({
      userid: s.userid,
      shipno: s.shipno,
      xcoord: s.xcoord,
      ycoord: s.ycoord,
      heading: s.heading,
      jammer: s.jammer,
      scanrange: getScanRange(s.shpclass),
    }));
}

export function setIonTrailObserverSource(
  source: ((mover: ShipState) => IonTrailObserver[]) | null,
): void {
  ionTrailObservers = source;
}

/**
 * Handles the `impulse` / `imp` command — sets the ship's impulse speed percentage
 * and optionally a relative course change.
 *
 * Usage: imp <0-99> [degrees]
 * - degrees is RELATIVE to current heading (added to heading, not absolute).
 *   `imp 50` → maintain current heading at 50% impulse.
 *   `imp 50 90` → turn 90° from current heading at 50% impulse.
 *
 * @see GECMDS.C:482 cmd_impulse
 * @see GECMDS.C:519 deg = normal(heading + degrees) — relative rotation
 */
export const impulseCommand: Command = {
  keyword: 'impulse',
  aliases: ['imp'],
  minArgs: 1,
  argMissingMessage: formatMessage(MessageId.IMPFMT),
  handler(ship: ShipState, args: string[], _ctx: CommandContext): CommandResult {
    // Hyperspace gate. C checks this BEFORE validating the speed and course
    // arguments (GECMDS.C:495-500), so `imp nonsense` in hyperspace answers
    // IMPULSE1, not NUMOOR. Note `where == 1` exactly: `where >= 10` is orbit,
    // handled further down, and answers LEAVEORB instead.
    if (ship.where === 1) {
      return { lines: [{ text: IMPULSE1, category: 'system' }] };
    }

    // A speed order alone is not a steering order: `nav` sets no speed, so
    // cancelling the autopilot here made the two mutually exclusive. Supplying a
    // COURSE is an explicit steering order and does take the helm back.
    const courseGiven = args.length > 1;

    const speedArg = args[0] ?? '';
    const speedResult = valpcnt(speedArg, 0, 99);

    if (!speedResult.ok) {
      return {
        lines: [{ text: formatMessage(MessageId.NUMOOR, 0, 99), category: 'system' }],
      };
    }

    // Optional course arg — relative degrees added to current heading (@see GECMDS.C:502-505)
    const courseArg = args[1] ?? '0';
    const courseResult = valdegree(courseArg);
    if (!courseResult.ok) {
      // valdegree's own range, which is what C prints on this failure
      // (GEFUNCS.C:1933). Quoting 0-359 here rejected a course of 208 — a
      // number inside the range the message named — with no hint why.
      // C's 0-359 belongs to `rot @`, a different form. @see GECMDS.C:672
      return {
        lines: [{ text: formatMessage(MessageId.NUMOOR, -180, 180), category: 'system' }],
      };
    }

    // TODO(006): see GECMDS.C:550 — helm gate (HLBROKE)

    const value = speedResult.value;
    const course = resolveEngineCourse(ship, courseGiven, courseResult.value);
    const deg = course.deg;

    if (course.releaseAutopilot && ship.holdcourse > 0) {
      ship.holdcourse = 0;
      ship.navTargetX = null;
      ship.navTargetY = null;
    }

    const lines: Array<{ text: string; category: string }> = [];

    // Leave orbit on engine fire — canon does three things here, not one:
    // `refresh(); prfmsg(LEAVEORB); where = 0; repair = 0;`
    // (GECMDS.C:512-517). The port zeroed `where` silently and kept the repair
    // queue, so a ship could buy a 2,500-credit repair at Zygor and carry it
    // away, healing 3 damage a second in deep space.
    if (ship.where >= 10) {
      ship.where = 0;
      ship.repair = 0;
      lines.push({ text: formatMessage(MessageId.LEAVEORB), category: 'system' });
    }

    ship.percent = value;
    ship.speed2b = 1000.0 * (value / 100.0);
    if (course.setHeading) ship.head2b = deg;
    ship.dirty = true;

    lines.push(
      value === 0
        ? { text: formatMessage(MessageId.ENGSTOP), category: 'success' }
        : { text: formatMessage(MessageId.ENGFIRE, deg), category: 'success' },
    );

    // CLOK3 — a cloaked ship that opens the throttle leaks its bearing to
    // nearby captains. Emitted AFTER speed2b is set, as in C (GECMDS.C:522-525),
    // and delivered to each listener's own socket, never to the sector.
    const broadcasts = cloakIonTrailReports(ship, ionTrailObservers?.(ship) ?? []).map((r) => ({
      room: `user:${r.userid}`,
      event: 'event.log',
      payload: { category: 'info', text: r.text },
    }));

    return (broadcasts.length > 0 ? { lines, broadcasts } : { lines }) as CommandResult;
  },
};
