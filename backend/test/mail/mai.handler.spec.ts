/**
 * MaiHandlerService — `mai` is the MAINTENANCE command (GECMDS.C:144
 * `{"mai", cmd_maint, 1}`), not the mailbox. Its only optional argument is the
 * planet trade password (GECMDS.C:4469).
 *
 * This file previously pinned the opposite: bare `mai` listed mail and only an
 * argument reached maintenance. That was the port's own invention — there is
 * no mail command in the original table at all — so the pins are rewritten
 * rather than preserved. The mailbox listing now lives in rea.handler.spec.ts.
 */

import { MaiHandlerService } from '../../src/game/commands/handlers/mai.handler';
import { MaintHandlerService } from '../../src/game/commands/handlers/maint.handler';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult } from '../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'alice', shipno: 1, shipname: 'AliceShip', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 30, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeServices(maintResult: CommandResult = { lines: [] }) {
  const mockMaintCommandHandler = jest.fn().mockResolvedValue(maintResult);
  const mockMaint = {
    command: { handler: mockMaintCommandHandler },
  } as unknown as MaintHandlerService;
  return { handler: new MaiHandlerService(mockMaint), mockMaintCommandHandler };
}

describe('MaiHandlerService — always maintenance', () => {
  it('bare `mai` runs maintenance', async () => {
    const maintResult: CommandResult = { lines: [{ text: 'repairing', category: 'success' }] };
    const { handler, mockMaintCommandHandler } = makeServices(maintResult);
    const ship = makeShip();

    const result = await handler.command.handler(ship, [], {});

    expect(mockMaintCommandHandler).toHaveBeenCalledWith(ship, [], {});
    expect(result).toStrictEqual(maintResult);
  });

  it('`mai <password>` forwards the password unchanged', async () => {
    const { handler, mockMaintCommandHandler } = makeServices();
    const ship = makeShip();

    await handler.command.handler(ship, ['sekrit'], {});

    expect(mockMaintCommandHandler).toHaveBeenCalledWith(ship, ['sekrit'], {});
  });

  it('passes the maintenance result through untouched', async () => {
    const maintResult: CommandResult = {
      lines: [{ text: 'Error: not in orbit', category: 'system' }],
    };
    const { handler } = makeServices(maintResult);
    const result = await handler.command.handler(makeShip(), [], {});
    expect(result).toStrictEqual(maintResult);
  });
});

describe('MaiHandlerService — command config', () => {
  it('keyword is "mai"', () => {
    expect(makeServices().handler.command.keyword).toBe('mai');
  });

  it('has no aliases', () => {
    expect(makeServices().handler.command.aliases).toHaveLength(0);
  });
});
