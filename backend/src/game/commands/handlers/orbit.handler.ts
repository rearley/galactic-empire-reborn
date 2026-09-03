import { Injectable } from '@nestjs/common';
import { GalaxyService } from '../../galaxy/galaxy.service';
import { ShipStateService } from '../../ship/ship-state.service';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { canEnterOrbit } from './helpers/orbit-range';

/**
 * Handles the `orbit` / `orb` command — enter orbit around a planet in the current sector.
 * @see GECMDS.C:758 cmd_orbit
 */
@Injectable()
export class OrbitHandlerService {
  constructor(
    private readonly galaxyService: GalaxyService,
    private readonly shipService: ShipStateService,
  ) {}

  get command(): Command {
    return {
      keyword: 'orbit',
      aliases: ['orb'],
      minArgs: 0,
      argMissingMessage: '',
      handler: (ship: ShipState, args: string[], ctx: CommandContext): CommandResult =>
        this.handle(ship, args, ctx),
    };
  }

  private handle(ship: ShipState, args: string[], _ctx: CommandContext): CommandResult {
    if (ship.where >= 10) {
      return { lines: [{ text: formatMessage(MessageId.ORBITALR), category: 'system' }] };
    }

    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const planets = this.galaxyService.getSectorPlanets(xsect, ysect);

    if (planets.length === 0) {
      return { lines: [{ text: formatMessage(MessageId.ORBITNO), category: 'system' }] };
    }

    let targetPlnum: number | undefined;

    if (planets.length === 1) {
      targetPlnum = planets[0].plnum;
    } else {
      const arg = args[0]?.trim();
      if (!arg) {
        const list = planets.map((p) => `${p.plnum}: ${p.name || '(unnamed)'}`).join(', ');
        return {
          lines: [{ text: formatMessage(MessageId.ORBITPK, list), category: 'system' }],
        };
      }
      const choice = parseInt(arg, 10);
      const found = planets.find((p) => p.plnum === choice);
      if (!found) {
        const list = planets.map((p) => `${p.plnum}: ${p.name || '(unnamed)'}`).join(', ');
        return {
          lines: [{ text: formatMessage(MessageId.ORBITPK, list), category: 'system' }],
        };
      }
      targetPlnum = found.plnum;
    }

    const planet = planets.find((p) => p.plnum === targetPlnum)!;

    // C refuses beyond 250 units (GECMDS.C cmd_orbit). Without this a ship
    // orbited from anywhere in the sector, which silently disabled planetary
    // defence: `checkdist` clears `hostile` past 1000 units, so the colony's
    // ion cannons never fired on an attacker sitting half a sector away.
    if (!canEnterOrbit(ship, planet)) {
      return { lines: [{ text: formatMessage(MessageId.ORBIT_TOO_FAR), category: 'system' }] };
    }

    this.shipService.mutate(ship.userid, ship.shipno, (s) => {
      s.where = 10 + targetPlnum!;
      s.speed = 0;
      s.speed2b = 0;
    });

    return {
      lines: [
        {
          // Two slots: the NUMBER first, then the name. The number is what the
          // pilot types into `sca pl <n>` and `tra`, which is why canon prints
          // it (GECMDS.C:800 `prfmsg(ORBIT1,plnum,plptr->name)`). Passing one
          // argument put the NAME in the %d slot and rendered the %s empty:
          // "Now in orbit around planet Zygor-3, ."
          text: formatMessage(MessageId.ORBIT01, targetPlnum, planet.name),
          category: 'success',
        },
      ],
    };
  }
}
