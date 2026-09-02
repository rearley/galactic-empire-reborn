import { Injectable } from '@nestjs/common';
import { MAXPLNTS } from '../../constants';
import { GalaxyService } from '../../galaxy/galaxy.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { PlanetStateService } from '../../planet/planet-state.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ScanHandlerService } from './scan.handler';
import { decideTradeAccess } from '../../planet/trade-access';

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

    // Owned by someone else — decided by the SHARED rule the buy path uses.
    //
    // This branch used to carry its own copy, and the copy was broken. Its
    // comment claimed "ship carries no explicit teamcode field, so we simply
    // allow if arg === 'team' OR if they know the real password", and then
    // admitted on `arg === 'team' || arg === ''`. ShipState.teamcode does
    // exist, and the visitor's team was never compared to the planet's — so a
    // bare `land`, or `land team` from any stranger, docked at a team-locked
    // world. @see planet/trade-access.ts, GECMDS.C:4232-4246
    // `land` keeps a STRICTER default than trading: a foreign colony with no
    // password set is closed to visitors, even though it will happily sell to
    // them. C has no `land` command at all — claiming goes through the `adm`
    // menu (GEMAIN.C:2899) — so there is no original to defer to here, and the
    // closed-by-default behaviour is left as the port had it. Only the team
    // check below changes.
    const pwd = (state.password ?? '').toLowerCase();
    if ((pwd === '' || pwd === 'none') && state.teamcode === 0n) {
      return { lines: [{ text: formatMessage(MessageId.LAND_REFUSED), category: 'system' }] };
    }

    const access = decideTradeAccess(
      { userid: state.userid, password: state.password, teamcode: state.teamcode },
      ship.userid,
      ship.teamcode ?? 0n,
      arg || undefined,
    );

    if (!access.ok) {
      const text =
        access.reason === 'BAD_PASSWORD'
          ? formatMessage(arg ? MessageId.LAND_PASSFAIL : MessageId.LAND_REFUSED)
          : formatMessage(MessageId.LAND_REFUSED);
      return { lines: [{ text, category: 'system' }] };
    }

    this.scanHandler.clearScantab(ship.userid, ship.shipno);
    return {
      lines: [{
        text: access.welcome
          ? formatMessage(MessageId.BUYPAS4)
          : formatMessage(MessageId.LAND_OK, state.name),
        category: 'success',
      }],
    };
  }
}