import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RANDOM, Random } from '../combat/random.port';
import { I_MEN, I_TROOPS } from '../constants/items';
import { MAIL_CLASS_DISTRESS } from '../constants';

/** MailStat.type for the two starvation notices. @see GEPLANET.C:211, :246 */
const MESG06 = 6 as const;
const MESG07 = 7 as const;
/** MailStat.type for the revolt notice. @see GEPLANET.C:368 */
const MESG30 = 30 as const;
import { applyEconomyTickWithLosses } from './planet-economy';
import { PlanetState } from './planet-state.types';

/**
 * Wraps the pure `applyEconomyTick` formula and adds the side-effecting
 * revolt branch (FR-028, R-11). The pure tick math stays in
 * `planet-economy.ts`; this service composes it with the RNG-driven
 * revolt check, mail generation, and ownership flip.
 *
 * The revolt branch fires when:
 *   1. The planet is currently owned (userid != null), AND
 *   2. (taxrate / 120) * 0.35 * men > troops, AND
 *   3. `gernd() % 10 === 0` — modeled here as `Math.floor(random.next() * 100) % 10 === 0`
 *
 * On revolt:
 *   - troops := floor(troops / ((rand % 8) + 2))
 *   - a `MAIL_CLASS_DISTRESS` row is queued for the former owner
 *   - userid := null  (planet returns to **Free**)
 *
 * No combat events are emitted from this path.
 *
 * @see GEPLANET.C:341-380 revolt branch
 */
@Injectable()
export class PlanetEconomyService {
  private readonly logger = new Logger(PlanetEconomyService.name);
  private lastMsgno = 0n;

  constructor(
    @Inject(RANDOM) private readonly random: Random,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Apply one economy tick and the revolt branch. Returns the new state
   * and a flag indicating whether a revolt fired (used by callers to skip
   * other ownership-dependent logic this tick).
   *
   * The mail-row insertion is fired-and-forgotten; failures are logged but
   * never block the tick.
   */
  async applyTick(state: PlanetState): Promise<{ state: PlanetState; revolted: boolean }> {
    const { state: next, starved } = applyEconomyTickWithLosses(state);

    // GEPLANET.C:211/246 — starvation mails the owner. Silent starvation meant a
    // colony could dwindle away with no notice reaching the player at all.
    if (next.userid !== null) {
      if (starved.troops > 0) {
        this.mailStarvation(next, 'TROOPS STARVED', MESG06, starved.troops);
      }
      if (starved.men > 0) {
        this.mailStarvation(next, 'COLONISTS STARVED', MESG07, starved.men);
      }
    }

    // Revolt only against an owned planet.
    if (next.userid === null) return { state: next, revolted: false };

    const men = Number(next.items[I_MEN].qty);
    const troops = Number(next.items[I_TROOPS].qty);

    // GEPLANET.C:348-353 — taxrate/120 * 0.35 * men
    const revoltPressure = (next.taxrate / 120) * 0.35 * men;
    if (revoltPressure <= troops) return { state: next, revolted: false };

    // GEPLANET.C:359 — gernd() % 10 == 0
    const randVal = Math.floor(this.random.next() * 100);
    if (randVal % 10 !== 0) return { state: next, revolted: false };

    // Revolt!
    const divisor = (randVal % 8) + 2;
    const newTroops = Math.floor(troops / divisor);

    const items = next.items.map((it) => ({ ...it }));
    items[I_TROOPS].qty = BigInt(newTroops);

    const oldOwner = next.userid;
    const planetName = next.name;
    const xsect = next.xsect;
    const ysect = next.ysect;

    void this.queueDistressMail(oldOwner, planetName, xsect, ysect, newTroops).catch((err) => {
      const stack = err instanceof Error ? err.stack : String(err);
      this.logger.error(`Distress mail failed for ${oldOwner} re ${planetName}: ${stack}`);
    });

    this.logger.log(`Revolt on ${planetName} (${xsect},${ysect}) — ${oldOwner} ousted; troops ${troops} -> ${newTroops}`);

    return {
      state: { ...next, items, userid: null },
      revolted: true,
    };
  }

  /**
   * Insert a MAIL_CLASS_DISTRESS row for the deposed owner. msgno uses
   * `Date.now()` to stay unique within the (userid, class) composite key
   * without requiring a sequence.
   *
   * @see GEPLANET.C:367-374 mail.class = MAIL_CLASS_DISTRESS path
   */
  private async queueDistressMail(
    userid: string,
    planetName: string,
    xsect: number,
    ysect: number,
    remainingTroops: number,
  ): Promise<void> {
    await this.insertDistressMail(userid, 'REVOLT', MESG30, planetName, xsect, ysect, remainingTroops);
  }

  /** Fire-and-forget starvation notice; a failed insert must not stall the tick. */
  private mailStarvation(planet: PlanetState, topic: string, type: number, lost: number): void {
    const owner = planet.userid;
    if (owner === null) return;
    void this
      .insertDistressMail(owner, topic, type, planet.name, planet.xsect, planet.ysect, lost)
      .catch((err: unknown) => {
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`Starvation mail failed for ${owner} re ${planet.name}: ${stack}`);
      });
  }

  /**
   * Writes to MailStat, not Mail: MailStat is the table `mai` reads, so a row in
   * Mail is invisible to the player. The revolt notice used to land there.
   *
   * @see GEFUNCS.C:2290 sendit — C has one delivery path for both structs
   */
  private async insertDistressMail(
    userid: string,
    topic: string,
    type: number,
    planetName: string,
    xsect: number,
    ysect: number,
    count: number,
  ): Promise<void> {
    await this.prisma.mailStat.create({
      data: {
        userid,
        class: MAIL_CLASS_DISTRESS,
        msgno: this.nextMsgno(),
        type,
        stamp: Math.floor(Date.now() / 1000),
        topic,
        name1: planetName.slice(0, 25),
        int1: xsect,
        int2: ysect,
        cash: BigInt(count),
        itemqty: [],
      },
    });
  }

  /**
   * Monotonic message number. `Date.now()` alone collides on the
   * (userid, class, msgno) key when a tick sends two notices — troops and men
   * starve in the same millisecond.
   */
  private nextMsgno(): bigint {
    const now = BigInt(Date.now());
    this.lastMsgno = now > this.lastMsgno ? now : this.lastMsgno + 1n;
    return this.lastMsgno;
  }
}
