import { Injectable, Inject } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { PlanetStateService } from '../../planet/planet-state.service';
import { PlanetAttackService } from '../../planet/planet-attack.service';
import { ShipClassCacheService } from '../../physics/ship-class-cache.service';
import { PLTYPE_WORM, SE100DAM } from '../../constants';
import { isInNeutralZone } from '../../combat/neutral-zone';
import { I_TROOPS, I_FIGHTER } from '../../constants/items';
import { FIRETICKS } from '../attack.config';
import { resolveItemKeyword } from '../validators';
import { parseUint32 } from '../validators';

/** Keyword indices used for argument disambiguation. */
const I_KW_TROOPS = I_TROOPS;
const I_KW_FIGHTERS = I_FIGHTER;

/**
 * Handles the `att` command — planet attack with troops or fighters.
 *
 * Precondition order (canonical source order from GECMDS.C:3515):
 *  FR-014-001: ship.where >= 10 (in orbit)
 *  FR-014-002: ship class can attack planets (max_attk != 0)
 *  FR-014-003: planet type != PLTYPE_WORM
 *  FR-014-004: planet.userid != ship.userid (not your own)
 *  FR-014-005: not in neutral zone (zaphim — ignored here, precondition only)
 *  FR-014-006: margc==3 && genearas("tro"|"fig", arg)
 *  FR-014-007: num > 0 && num <= ship cargo
 *
 * @see GECMDS.C:3515 cmd_attack
 */
@Injectable()
export class AttackHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly planetService: PlanetStateService,
    private readonly attackService: PlanetAttackService,
    private readonly shipClassCache: ShipClassCacheService,
    @Inject(FIRETICKS) private readonly fireticks: number,
  ) {}

  readonly command: Command = {
    keyword: 'att',
    aliases: [],
    minArgs: 0,
    argMissingMessage: formatMessage(MessageId.ATT_FORMAT),
    handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
      this.handle(ship, args, ctx),
  };

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    // FR-014-001: must be in orbit.
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.ATT_NOT_ORBIT), category: 'system' }] };
    }

    // FR-014-002: ship class can attack planets.
    const cls = this.shipClassCache.get(ship.shpclass);
    if (!cls?.canAttackPlanet) {
      return { lines: [{ text: formatMessage(MessageId.ATT_NO_CAPABILITY), category: 'system' }] };
    }

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const planet = this.planetService.get(xsect, ysect, plnum);

    if (!planet) {
      return { lines: [{ text: formatMessage(MessageId.ATT_NOT_ORBIT), category: 'system' }] };
    }

    // FR-014-003: no attacking wormholes.
    if (planet.type === PLTYPE_WORM) {
      return { lines: [{ text: formatMessage(MessageId.ATT_WORMHOLE), category: 'system' }] };
    }

    // FR-014-005: neutral zone. C fires zaphim and RETURNS WITHOUT RESOLVING
    // THE ATTACK (GECMDS.C:3555-3559) -- the same early abort as firep. This
    // was a comment claiming the combat tick handled it; nothing did, so `att`
    // in the hub was completely unpunished. Sector (0,0) is where every new
    // player buys ships, ordnance, men and food, and our fixture planets carry
    // no troops or fighters, so the trade hub could be raided and taken on the
    // first attack.
    if (isInNeutralZone(ship)) {
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.damage = s.damage + SE100DAM;
        // Self-inflicted and attacker-less: without a cause the manifest read
        // `cause=unknown` for a pilot who shot themselves at the origin.
        // @see issue #54
        s.deathCause = { kind: 'neutral-zone', what: 'the neutral zone' };
      });
      return { lines: [{ text: formatMessage(MessageId.WPN_ZAP), category: 'combat' }] };
    }

    // FR-014-004: self-attack check.
    if (planet.userid === ship.userid) {
      return { lines: [{ text: formatMessage(MessageId.ATT_SELF), category: 'system' }] };
    }

    // FR-014-006: arg parsing — require "att <amount> <troops|fighters>".
    const numStr = args[0] ?? '';
    const kindStr = args[1] ?? '';
    const num = parseUint32(numStr);
    if (num === undefined || num === 0) {
      return { lines: [{ text: formatMessage(MessageId.ATT_FORMAT), category: 'system' }] };
    }
    const itemIndex = resolveItemKeyword(kindStr);
    if (itemIndex !== I_KW_TROOPS && itemIndex !== I_KW_FIGHTERS) {
      return { lines: [{ text: formatMessage(MessageId.ATT_FORMAT), category: 'system' }] };
    }
    const isTroop = itemIndex === I_KW_TROOPS;
    const noCargoMsg = isTroop ? MessageId.ATT_NO_TROOPS : MessageId.ATT_NO_FIGHTERS;

    // FR-014-007: sufficient cargo pre-check (outside lock — STATIC check).
    const shipCargo = Number(ship.items[itemIndex] ?? 0n);
    if (shipCargo < num) {
      return { lines: [{ text: formatMessage(noCargoMsg), category: 'system' }] };
    }

    // Acquire per-planet mutex. Inside: re-validate state-dependent preconditions,
    // deduct cargo, run combat, flush planet.
    // @see research.md D1 — mutex re-validation scope
    const outcome = await this.planetService.withPlanetLock(xsect, ysect, plnum, async () => {
      // Re-validate orbit (ship.where may have changed if tick moved ship).
      const freshPlanet = this.planetService.get(xsect, ysect, plnum);
      if (!freshPlanet) {
        return null; // planet disappeared — treat as not in orbit
      }
      if (ship.where < 10) {
        return null;
      }
      // Self-attack re-check (planet may have been captured by concurrent attacker).
      if (freshPlanet.userid === ship.userid) {
        return { rejected: MessageId.ATT_SELF as MessageId };
      }
      // Cargo re-check (concurrent transfer might have depleted cargo).
      const freshCargo = Number(ship.items[itemIndex] ?? 0n);
      if (freshCargo < num) {
        return { rejected: noCargoMsg };
      }

      // Set hostile state and lock attacker in orbit BEFORE combat runs.
      // @see GECMDS.C:3567–3576 — ship.hostile and cantexit set BEFORE math
      this.shipState.mutate(ship.userid, ship.shipno, (s) => {
        s.hostile = ship.where;
        s.cantexit = this.fireticks;
        s.items[itemIndex] = (s.items[itemIndex] ?? 0n) - BigInt(num);
      });

      // Run combat math.
      const result = isTroop
        ? await this.attackService.attackTroop(num, ship, freshPlanet)
        : await this.attackService.attackFighter(num, ship, freshPlanet);

      // Flush planet state to Postgres.
      await this.planetService.flushPlanet(xsect, ysect, plnum);

      return { outcome: result };
    });

    if (!outcome || 'rejected' in outcome) {
      const msg = outcome?.rejected ?? MessageId.ATT_NOT_ORBIT;
      return { lines: [{ text: formatMessage(msg as MessageId), category: 'system' }] };
    }

    // Convert narration to CommandResult lines.
    const lines = outcome.outcome.narration.map((text) => ({
      text,
      category: 'combat' as const,
    }));

    // cmd_attack closes on the verdict, and it belongs to the COMMAND rather
    // than to either resolver: both attack_men and attack_fig return `won` and
    // cmd_attack prints ATTACK8 or ATTACK9 from it (GECMDS.C:3571-3580,
    // 3597-3606). The port had no closing line at all, so a raid that took the
    // planet read the same as one that bounced off it.
    lines.push({
      text: formatMessage(outcome.outcome.won === 1 ? MessageId.ATT_WON : MessageId.ATT_STANDOFF),
      category: 'combat' as const,
    });

    return { lines };
  }
}
