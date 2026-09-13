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
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'alice',
    shipname: 'AliceShip',
    xcoord: 5.5,
    ycoord: 5.5,
    damage: 30,
    energy: 10000,
    where: 10,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

function makeServices(maintResult: CommandResult = { lines: [] }) {
  const mockMaintCommandHandler = vi.fn().mockResolvedValue(maintResult);
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
