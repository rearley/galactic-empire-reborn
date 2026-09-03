import { checkSpy } from './spy';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RANDOM, Random } from '../combat/random.port';
import { I_MEN, I_TROOPS, I_SPY } from '../constants/items';
import { MAIL_CLASS_DISTRESS } from '../constants';
import { MAIL_CLASS_PRODRPT } from '../midnight/midnight.constants';
import { PRODUCTION_CAP_MAIL_TYPES, PRODUCTION_CAP_TOPIC } from '../mail/production-cap';

/** MailStat.type for the two starvation notices. @see GEPLANET.C:211, :246 */
const MESG06 = 6 as const;
const MESG07 = 7 as const;
/** MailStat.type for the revolt notice. @see GEPLANET.C:368 */
const MESG30 = 30 as const;
/** SPYC1 — to the spy's master: your spy was caught. @see GEPLANET.C:125 */
const MESG_SPYC1 = 31 as const;
/** SPYC2 — to the planet's owner: we caught a spy. @see GEPLANET.C:134 */
const MESG_SPYC2 = 32 as const;
import { applyEconomyTickWithLosses, FREE_PLANET_OWNER, ProductionCapHit } from './planet-economy';
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
    const { state: next, starved, capped } = applyEconomyTickWithLosses(state);

    // GEPLANET.C:211/246 — starvation mails the owner. Silent starvation meant a
    // colony could dwindle away with no notice reaching the player at all.
    if (next.userid !== null) {
      if (starved.troops > 0) {
        this.mailStarvation(next, 'TROOPS STARVED', MESG06, starved.troops);
      }
      if (starved.men > 0) {
        this.mailStarvation(next, 'COLONISTS STARVED', MESG07, starved.men);
      }
      // GEPLANET.C:313-326 — every slot that just topped out gets its own
      // MESG08+i notice, class MAIL_CLASS_PRODRPT, long1 = the ceiling.
      for (const hit of capped) {
        this.mailProductionCap(next, hit);
      }
    }

    // Counter-espionage — `check_spy` runs on the same tick as `multiply`
    // (GEMAIN.C:2139). A spy on a planet you have since taken goes home, and a
    // garrison of counter-spies eventually catches an infiltrator.
    // @see GEPLANET.C:93-145
    const spy = checkSpy(
      {
        spyowner: next.spyowner ?? '',
        owner: next.userid,
        counterSpies: Number(next.items[I_SPY]?.qty ?? 0n),
      },
      this.random,
    );
    if (spy.outcome !== 'none') {
      next.spyowner = '';
      if (spy.outcome === 'caught') {
        // C mails BOTH sides an "** Official Protest **" (GEPLANET.C:122-141).
        this.mailSpyCaught(next, spy.spyowner);
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
    if (Math.floor(this.random.next() * 10) !== 0) return { state: next, revolted: false };

    // Revolt! The severity is a SECOND, independent draw:
    // `cnt = plptr->items[I_TROOPS].qty / ((gernd()%8)+2)`. Deriving it from
    // the same value as the gate above left only {0,10,...,90} in play, whose
    // residues mod 8 are {0,2,4,6} — so the divisor could only ever be 2, 4, 6
    // or 8, unevenly weighted, instead of uniform over 2..9.
    // @see GEPLANET.C:359-361
    const divisor = Math.floor(this.random.next() * 8) + 2;
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
      // "**Free**", not null. C keeps the planet economically alive after a
      // revolt (GEPLANET.C:377); writing null froze it forever.
      state: { ...next, items, userid: FREE_PLANET_OWNER },
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

  /**
   * Both sides hear about a caught spy — C sends an "** Official Protest **"
   * to the spy's master (SPYC1) and to the planet's owner (SPYC2).
   * Fire-and-forget: a failed insert must not stall the tick.
   *
   * @see GEPLANET.C:122-141
   */
  private mailSpyCaught(planet: PlanetState, spyowner: string): void {
    const log = (err: unknown) => {
      const stack = err instanceof Error ? err.stack : String(err);
      this.logger.error(`Spy-caught mail failed for ${planet.name}: ${stack}`);
    };
    void this.insertDistressMail(
      spyowner, 'OFFICIAL PROTEST', MESG_SPYC1, planet.name, planet.xsect, planet.ysect, 0,
    ).catch(log);
    if (planet.userid) {
      void this.insertDistressMail(
        planet.userid, 'OFFICIAL PROTEST', MESG_SPYC2, planet.name, planet.xsect, planet.ysect, 0,
      ).catch(log);
    }
  }

  /**
   * A storage ceiling was reached — canon's MESG08+i. Fire-and-forget, exactly
   * like the starvation notices: a failed insert must not stall the tick.
   *
   * The recipient is `plptr->userid` verbatim, "**Free**" included; the
   * midnight purge sweeps `*`-prefixed recipients (GEMAIN.C:1195-1196), so a
   * revolted colony's notices clean themselves up.
   *
   * @see GEPLANET.C:313-326
   */
  private mailProductionCap(planet: PlanetState, hit: ProductionCapHit): void {
    const owner = planet.userid;
    if (owner === null) return;
    void this
      .insertDistressMail(
        owner,
        PRODUCTION_CAP_TOPIC,
        PRODUCTION_CAP_MAIL_TYPES[hit.item],
        planet.name,
        planet.xsect,
        planet.ysect,
        hit.cap,
        MAIL_CLASS_PRODRPT,
      )
      .catch((err: unknown) => {
        const stack = err instanceof Error ? err.stack : String(err);
        this.logger.error(`Production-cap mail failed for ${owner} re ${planet.name}: ${stack}`);
      });
  }

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
   * Writes to MailStat, not Mail: MailStat is the table `rea` reads, so a row in
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
    klass: number = MAIL_CLASS_DISTRESS,
  ): Promise<void> {
    await this.prisma.mailStat.create({
      data: {
        userid,
        class: klass,
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
