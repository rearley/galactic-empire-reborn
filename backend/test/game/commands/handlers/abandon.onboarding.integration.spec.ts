/**
 * T045 — After abandon, the next gameplay command is rejected by FR-803 router gate.
 * Verifies SHIP_ABANDONED message is returned for any command sent to an abandoned ship.
 * @see command-router.service.ts FR-803
 * @see specs/013-ship-management/tasks.md T045
 */
import { CommandRouterService } from '../../../../src/game/commands/command-router.service';
import { AbandonHandlerService } from '../../../../src/game/commands/handlers/abandon.handler';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { SHIP_STATUS_ABANDONED } from '../../../../src/game/commands/_ship-management-constants';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'USS Departing',
    xcoord: 5,
    ycoord: 5,
    energy: 10000,
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

function buildHarness() {
  const ship = makeShip();

  const mockShipState = {
    // abandon() persists status as well as setting it — the tick flush strips
    // `status`, so the handler cannot go through mutate().
    abandon: jest.fn().mockImplementation((_uid: string, _no: number) => {
      ship.status = SHIP_STATUS_ABANDONED;
      ship.destruct = 0;
      return Promise.resolve();
    }),
    findShip: jest.fn().mockReturnValue(ship),
  } as unknown as ShipStateService;

  const router = new CommandRouterService();
  const abandonHandler = new AbandonHandlerService(mockShipState, { abandonPlanet: jest.fn().mockResolvedValue({ ok: true, name: 'Aurora' }) } as unknown as PlanetStateService);

  // Register only the abandon command + a test command to exercise the FR-803 gate
  router.register(abandonHandler.command);

  // Also register a fake "scan" to prove the gate blocks known commands
  router.register({
    keyword: 'scan',
    aliases: [],
    minArgs: 0,
    argMissingMessage: '',
    handler: () => ({ lines: [{ text: 'SCAN_RESULT', category: 'info' }] }),
  });

  return { router, ship, abandonHandler };
}

describe('FR-803 — post-abandon router gate rejects all commands', () => {
  it('after abandon, scan command → SHIP_ABANDONED (not scan result)', () => {
    const { router, ship } = buildHarness();

    // Mark ship as abandoned directly (simulating what abandon handler does)
    ship.status = SHIP_STATUS_ABANDONED;

    const result = router.dispatch('scan', ship, {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SHIP_ABANDONED));
  });

  it('after abandon, unknown command → SHIP_ABANDONED (not UNKNOWN_CMD)', () => {
    const { router, ship } = buildHarness();
    ship.status = SHIP_STATUS_ABANDONED;

    const result = router.dispatch('warp 9', ship, {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SHIP_ABANDONED));
  });

  it('abandon handler → sets status=3 → subsequent dispatch blocked', () => {
    const { router, ship, abandonHandler } = buildHarness();

    // Execute abandon via the handler
    abandonHandler.command.handler(ship, ['ship', 'yes'], {});
    expect(ship.status).toBe(SHIP_STATUS_ABANDONED);

    // Next command via router is blocked
    const result = router.dispatch('scan', ship, {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SHIP_ABANDONED));
  });

  it('active ship (status=1) passes the gate normally', () => {
    const { router, ship } = buildHarness();
    expect(ship.status).toBe(1); // not abandoned

    const result = router.dispatch('scan', ship, {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe('SCAN_RESULT');
  });
});
