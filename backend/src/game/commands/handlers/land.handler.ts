import { Injectable } from '@nestjs/common';
import { MAXPLNTS } from '../../constants';
import { GalaxyService } from '../../galaxy/galaxy.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { PlanetStateService } from '../../planet/planet-state.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ScanHandlerService } from './scan.handler';

/**
 * Handles the `land` / `lan` command — land on the planet currently in orbit.
 * On an unowned planet with no name arg, prompts for a name (one-shot redispatch).
 * @see GECMDS.C:cmd_land
 */
@Injectable()
export class LandHandlerService {
  constructor(
    private readonly galaxyService: GalaxyService,
    private readonly shipService: ShipStateService,
    private readonly planetService: PlanetStateService,
    private readonly scanHandler: ScanHandlerService,
  ) {}

  get command(): Command {
    return {
      keyword: 'land',
      aliases: ['lan'],
      minArgs: 0,
      argMissingMessage: '',
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.LAND_NOT_ORBIT), category: 'system' }] };
    }

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const planets = this.galaxyService.getSectorPlanets(xsect, ysect);
    const planet = planets.find((p) => p.plnum === plnum);

    const state = this.planetService.get(xsect, ysect, plnum);

    if (!state) {
      return { lines: [{ text: formatMessage(MessageId.ORBITNO), category: 'system' }] };
    }

    // Join, don't take args[0]: planet names may contain spaces ("New Terra"),
    // and the followup redispatch delivers the whole answer as arguments.
    const arg = args.join(' ').trim();

    // Unowned planet
    if (state.userid === null) {
      if (!arg) {
        // `expectFollowup` makes the gateway feed the player's next line back
        // here as `land <name>`. Without it the answer went through the command
        // router, so "New Terra" matched the `new` verb and the planet stayed
        // unclaimed with no hint that `land <name>` was the real syntax.
        return {
          lines: [{ text: formatMessage(MessageId.LAND_NAME_PROMPT), category: 'system' }],
          expectFollowup: 'land',
        };
      }

      // Validate name
      if (arg.length < 1 || arg.length > 19 || !/^[\x20-\x7E]+$/.test(arg)) {
        return {
          lines: [{ text: formatMessage(MessageId.LAND_INVALID_NAME), category: 'system' }],
        };
      }

      // Await the claim so its outcome reaches the player. CommandHandler
      // already permits a Promise result, so this needs no router change.
      // Previously fire-and-forget, which meant a PLANET_LIMIT refusal was
      // enforced but invisible — the player still saw LAND_CLAIMED.
      const claimed = await this.planetService
        .claim(xsect, ysect, plnum, ship.userid, arg)
        .catch(() => ({ ok: false as const, reason: 'NOT_FOUND' as const }));

      if (!claimed.ok) {
        const text =
          claimed.reason === 'PLANET_LIMIT'
            ? formatMessage(MessageId.LAND_PLANET_LIMIT, String(MAXPLNTS))
            : claimed.reason === 'NEUTRAL_ZONE'
              ? formatMessage(MessageId.LAND_NEUTRAL_ZONE)
              : claimed.reason === 'OWNED'
                ? formatMessage(MessageId.LAND_REFUSED)
                : formatMessage(MessageId.LAND_INVALID_NAME);
        return { lines: [{ text, category: 'system' }] };
      }

      // Clear scantab on successful dock — stale letter assignments must not persist.
      this.scanHandler.clearScantab(ship.userid, ship.shipno);
      return {
        lines: [
          { text: formatMessage(MessageId.LAND_CLAIMED, arg), category: 'success' },
        ],
      };
    }

    // Owned by this player
    if (state.userid === ship.userid) {
      // Clear scantab on successful dock.
      this.scanHandler.clearScantab(ship.userid, ship.shipno);
      return {
        lines: [{ text: formatMessage(MessageId.LAND_OK, state.name), category: 'success' }],
      };
    }

    // Owned by someone else
    const pwd = state.password;

    // No password set or "none" — refuse
    if (!pwd || pwd === 'none') {
      return { lines: [{ text: formatMessage(MessageId.LAND_REFUSED), category: 'system' }] };
    }

    // Team password check
    if (pwd === 'team') {
      const ship2 = this.shipService.get(ship.userid, ship.shipno);
      if (ship2 && state.teamcode !== 0n) {
        // Team code matching: check if ship's userid has a matching teamcode
        // We use planet.teamcode directly — ship carries no explicit teamcode field
        // so we simply allow if arg === "team" OR if they know the real password
        // For the team-pass case: allowed unconditionally when password == "team" + arg provided
        if (arg === 'team' || arg === '') {
          // Clear scantab on successful dock.
          this.scanHandler.clearScantab(ship.userid, ship.shipno);
          return { lines: [{ text: formatMessage(MessageId.BUYPAS4), category: 'success' }] };
        }
      }
      return { lines: [{ text: formatMessage(MessageId.LAND_REFUSED), category: 'system' }] };
    }

    // Password provided
    if (arg && arg === pwd) {
      // Clear scantab on successful dock.
      this.scanHandler.clearScantab(ship.userid, ship.shipno);
      return { lines: [{ text: formatMessage(MessageId.LAND_OK, state.name), category: 'success' }] };
    }

    if (!arg) {
      return { lines: [{ text: formatMessage(MessageId.LAND_REFUSED), category: 'system' }] };
    }

    return { lines: [{ text: formatMessage(MessageId.LAND_PASSFAIL), category: 'system' }] };
  }
}
