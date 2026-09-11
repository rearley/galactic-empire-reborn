/**
 * T044 — Unit spec for AbandonHandlerService.
 * Happy path: ship marked abandoned, captain detached, sector broadcast, per-captain reply.
 * @see GECMDS.C:3420 cmd_abandon (semantics reinterpreted — see research.md D2)
 * @see contracts/commands.md §abandon
 */
import { AbandonHandlerService } from '../../../../src/game/commands/handlers/abandon.handler';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../../src/game/commands/command.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { SHIP_STATUS_ABANDONED } from '../../../../src/game/commands/_ship-management-constants';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'USS Freedom',
    xcoord: 5.5,
    ycoord: 7.3,
    energy: 10000,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

function makeService(ship: ShipState) {
  const mockShipState = {
    // abandon() persists status as well as setting it — the tick flush strips
    // `status`, so the handler cannot go through mutate().
    abandon: jest.fn().mockImplementation((_uid: string, _no: number) => {
      ship.status = SHIP_STATUS_ABANDONED;
      ship.destruct = 0;
      return Promise.resolve();
    }),
  } as unknown as ShipStateService;
  return { handler: new AbandonHandlerService(mockShipState, { abandonPlanet: jest.fn().mockResolvedValue({ ok: true, name: 'Aurora' }) } as unknown as PlanetStateService), mockShipState };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('AbandonHandlerService — happy path (SC-007)', () => {
  it('marks ship.status = SHIP_STATUS_ABANDONED (3)', () => {
    const ship = makeShip({ status: 1 });
    const { handler } = makeService(ship);
    handler.command.handler(ship, ['ship', 'yes'], {});
    expect(ship.status).toBe(SHIP_STATUS_ABANDONED);
  });

  it('returns ABANDON_OK success line with shipname', async () => {
    const ship = makeShip({ shipname: 'USS Freedom' });
    const { handler } = makeService(ship);
    const result = (await handler.command.handler(ship, ['ship', 'yes'], {})) as { lines: { text: string; category: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABANDON_OK, 'USS Freedom'));
    expect(result.lines[0].category).toBe('success');
  });

  it('broadcasts ABANDON_SECTOR to the sector room', async () => {
    const ship = makeShip({ xcoord: 5.5, ycoord: 7.3, shipname: 'USS Freedom' });
    const { handler } = makeService(ship);
    const result = (await handler.command.handler(ship, ['ship', 'yes'], {})) as {
      lines: unknown[];
      broadcasts?: { room: string; event: string; payload: { text: string } }[];
    };
    expect(result.broadcasts).toBeDefined();
    expect(result.broadcasts![0].room).toBe('sector:5:7');
    expect(result.broadcasts![0].event).toBe('event.log');
    expect(result.broadcasts![0].payload.text).toContain('USS Freedom');
  });

  it('clears ctx.client.data.activeShipNo when client is present', () => {
    const ship = makeShip();
    const { handler } = makeService(ship);
    const fakeClient = { data: { activeShipNo: ship.shipno } };
    const ctx: CommandContext = { client: fakeClient as unknown as CommandContext['client'] };
    handler.command.handler(ship, ['ship', 'yes'], ctx);
    expect(fakeClient.data.activeShipNo).toBeUndefined();
  });

  it('no error when ctx has no client (no-socket invocation)', () => {
    const ship = makeShip();
    const { handler } = makeService(ship);
    expect(() => handler.command.handler(ship, ['ship', 'yes'], {})).not.toThrow();
  });
});

describe('AbandonHandlerService — command metadata', () => {
  it('keyword is "abandon", alias includes "aba", minArgs is 0', () => {
    const ship = makeShip();
    const { handler } = makeService(ship);
    expect(handler.command.keyword).toBe('abandon');
    expect(handler.command.aliases).toContain('aba');
    expect(handler.command.minArgs).toBe(0);
  });
});
