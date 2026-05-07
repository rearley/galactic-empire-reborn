import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { PlanetStateService } from '../../planet/planet-state.service';
import { PLTYPE_WORM } from '../../constants';
import { I_SPY } from '../../constants/items';

/** @see GECMDS.C:6040 cmd_spy */
@Injectable()
export class SpyHandlerService {
  constructor(private readonly planetService: PlanetStateService) {}

  readonly command: Command = {
    keyword: 'spy',
    aliases: [],
    minArgs: 0,
    argMissingMessage: '',
    handler: (ship: ShipState, _args: string[], _ctx: CommandContext): CommandResult => {
      // SPY1 — must be in orbit
      if (ship.where < 10) {
        return { lines: [{ text: formatMessage(MessageId.SPY1), category: 'system' }] };
      }

      // Resolve planet
      const plnum = ship.where - 10;
      const xsect = Math.floor(ship.xcoord);
      const ysect = Math.floor(ship.ycoord);
      const planet = this.planetService.get(xsect, ysect, plnum);

      if (!planet) {
        return { lines: [{ text: formatMessage(MessageId.SPY1), category: 'system' }] };
      }

      // SPY0B — no spying on wormholes
      if (planet.type === PLTYPE_WORM) {
        return { lines: [{ text: formatMessage(MessageId.SPY0B), category: 'system' }] };
      }

      // SPY0 — already own this planet
      if (planet.userid !== null && planet.userid.toLowerCase() === ship.userid.toLowerCase()) {
        return { lines: [{ text: formatMessage(MessageId.SPY0), category: 'system' }] };
      }

      // SPY0C — neutral zone
      if (xsect === 0 && ysect === 0) {
        return { lines: [{ text: formatMessage(MessageId.SPY0C), category: 'system' }] };
      }

      // SPYM0 — no spy equipment
      if ((ship.items[I_SPY] ?? 0n) <= 0n) {
        return { lines: [{ text: formatMessage(MessageId.SPYM0), category: 'system' }] };
      }

      // Success — plant the spy
      ship.items[I_SPY] = ship.items[I_SPY] - 1n;
      ship.dirty = true;
      planet.spyowner = ship.userid;
      planet.dirty = true;

      return {
        lines: [{
          text: formatMessage(MessageId.SPYM1, planet.name),
          category: 'success',
        }],
      };
    },
  };
}
