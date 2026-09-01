import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { PlanetStateService } from '../../planet/planet-state.service';

/**
 * Handles `abandon` / `aba`.
 *
 * Bare `aba` is the canonical command: in orbit over a planet you own, it
 * releases the planet (GECMDS.C:3420 cmd_abandon). Research D2 had
 * reinterpreted the keyword as abandon-*ship* and deferred colony abandonment
 * to the planet feature, where it was never picked up — so a player had no way
 * to give up a planet at all, while a mistyped `abo` (abort self-destruct)
 * scuttled their hull.
 *
 * The port's ship-scuttle path is still here, behind the explicit `aba ship`.
 * It marks the hull abandoned and routes the captain back through the
 * feature-011 onboarding flow (FR-701..FR-704), clearing any destruct countdown
 * on the way (abandon takes precedence — spec.md Edge Cases).
 *
 * @see GECMDS.C:3420 cmd_abandon
 * @see specs/013-ship-management/research.md D2
 */
/** Words that mean "yes, do it" in answer to an abandon prompt. */
function isConfirmation(word: string | undefined): boolean {
  const w = word?.toLowerCase();
  return w === 'yes' || w === 'y';
}

@Injectable()
export class AbandonHandlerService {
  constructor(
    private readonly shipState: ShipStateService,
    private readonly planetState: PlanetStateService,
  ) {}

  readonly command: Command = {
    keyword: 'abandon',
    aliases: ['aba'],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
      this.handle(ship, args, ctx),
  };

  private async handle(
    ship: ShipState,
    args: string[],
    ctx: CommandContext,
  ): Promise<CommandResult> {
    const arg0 = args[0]?.toLowerCase();

    if (arg0 === 'ship') {
      if (isConfirmation(args[1])) return this.abandonShip(ship, ctx);
      return {
        lines: [{ text: formatMessage(MessageId.ABAN_CONFIRM_SHIP, ship.shipname), category: 'system' }],
        expectFollowup: 'aba ship',
      };
    }

    if (arg0 === undefined) return this.confirmAbandonPlanet(ship);
    if (isConfirmation(arg0)) return this.abandonPlanet(ship);

    // Anything else answering the prompt is a refusal, not a command.
    return { lines: [{ text: formatMessage(MessageId.ABAN_CANCELLED), category: 'system' }] };
  }

  /**
   * Ask before releasing a colony.
   *
   * DEVIATION FROM C (deliberate — see docs/DECISIONS.md). `cmd_abandon`
   * releases the planet on the spot with no confirmation. Three keystrokes
   * separated a colony built over days from oblivion, and the command set puts
   * `aba` one letter from `abo` (abort self-destruct). Naming the planet in
   * the prompt is the check: it is how the captain sees which one they are
   * about to lose.
   */
  private async confirmAbandonPlanet(ship: ShipState): Promise<CommandResult> {
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.ABAN01), category: 'system' }] };
    }

    const planet = this.planetState.get(
      Math.floor(ship.xcoord),
      Math.floor(ship.ycoord),
      ship.where - 10,
    );
    // Same single rejection C uses for "not yours" and "cannot read it".
    if (!planet || planet.userid?.toLowerCase() !== ship.userid.toLowerCase()) {
      return { lines: [{ text: formatMessage(MessageId.ABAN03), category: 'system' }] };
    }

    return {
      lines: [{
        text: formatMessage(MessageId.ABAN_CONFIRM_PLANET, planet.name || `planet ${ship.where - 10}`),
        category: 'system',
      }],
      expectFollowup: 'aba',
    };
  }

  /**
   * Canonical colony abandonment.
   *
   * C gates on `warsptr->where < 10` — orbit, the same gate as buy and admin —
   * then compares the planet's userid to the captain's. Nothing about the
   * planet other than its owner is changed, so the colony survives intact for
   * whoever claims it next.
   *
   * @see GECMDS.C:3420 cmd_abandon
   */
  private async abandonPlanet(ship: ShipState): Promise<CommandResult> {
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.ABAN01), category: 'system' }] };
    }

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);

    const result = await this.planetState.abandonPlanet(xsect, ysect, plnum, ship.userid);
    if (!result.ok) {
      // C has one rejection for both "not yours" and a planet it cannot read.
      return { lines: [{ text: formatMessage(MessageId.ABAN03), category: 'system' }] };
    }

    return {
      lines: [{ text: formatMessage(MessageId.ABAN02, result.name), category: 'success' }],
    };
  }

  /** The port's addition: scuttle the hull and go back through ship entry. */
  private abandonShip(ship: ShipState, ctx: CommandContext): CommandResult {
    const shipname = ship.shipname;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);

    // Goes through ShipStateService.abandon rather than mutate() because
    // `status` is stripped from the per-tick flush — set in memory alone, the
    // mark vanished on the next restart and the hull came back flyable.
    void this.shipState.abandon(ship.userid, ship.shipno);

    // Detach captain from gateway session (clear activeShipNo so the next
    // command does not reach the dead hull).
    if (ctx.client) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      ctx.client.data.activeShipNo = undefined;
    }

    return {
      lines: [{ text: formatMessage(MessageId.ABANDON_OK, shipname), category: 'success' }],
      // FR-704 — hand the captain straight back to ship entry. Clearing
      // activeShipNo alone left the session answering "No active ship." to
      // every command, with no way to acquire a new hull.
      reenterShipEntry: true,
      broadcasts: [
        {
          room: `sector:${xsect}:${ysect}`,
          event: 'event.log',
          payload: {
            category: 'info',
            text: formatMessage(MessageId.ABANDON_SECTOR, shipname),
          },
        },
      ],
    };
  }
}
