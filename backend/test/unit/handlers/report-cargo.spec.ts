/**
 * T057 — ReportHandlerService cargo sub-command tests.
 */
import { CommandResult } from '../../../src/game/commands/command.types';
import { ReportHandlerService } from '../../../src/game/commands/handlers/report.handler';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, I_FOOD, I_MEN, ITEM_NAMES, ITEM_TONS, capitaliseItem } from '../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

const MAX_TONS = 500;

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'USS Test',
    xcoord: 5.5,
    ycoord: 3.5,
    items: Array(NUMITEMS).fill(0n),
    status: 0,
    topspeed: 0,
    ...overrides,
  });
}

function makeService(maxTons = MAX_TONS) {
  const prismaMock = {};
  const shipClassCache = new ShipClassCacheService({} as never);
  shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, typeName: 'Interceptor', hasCloak: false, maxTons });
  const service = new ReportHandlerService(
    prismaMock as unknown as PrismaService,
    undefined,
    shipClassCache,
  );
  return { service };
}

/**
 * The cargo column shows `Food cases`, not `food cases`: canon leaves
 * item_name[] lower case and uppercases the first character where it prints a
 * column — `gechrbuf[0] = toupper(gechrbuf[0])`, GECMDS.C:2064-2065. Hence
 * capitaliseItem() here rather than the raw table.
 */
describe('ReportHandlerService — cargo sub-command', () => {
  it('empty cargo shows REP_CARGO_NONE', async () => {
    const { service } = makeService();
    const result = await (service.command.handler(makeShip(), ['cargo'], {}) as Promise<CommandResult>);
    expect(result.lines.some(l => l.text === formatMessage(MessageId.REP_CARGO_NONE))).toBe(true);
  });

  it('always includes REP_CARGO_TOTAL line', async () => {
    const { service } = makeService();
    const result = await (service.command.handler(makeShip(), ['cargo'], {}) as Promise<CommandResult>);
    expect(result.lines.some(l => l.text.includes('Total:'))).toBe(true);
  });

  it('REP_CARGO_TOTAL shows capacity from ship class', async () => {
    const { service } = makeService(250);
    const result = await (service.command.handler(makeShip(), ['cargo'], {}) as Promise<CommandResult>);
    const totalLine = result.lines.find(l => l.text.includes('Total:'));
    expect(totalLine?.text).toContain('250');
  });

  it('non-zero item shows REP_CARGO_LINE with item name', async () => {
    const { service } = makeService();
    const items = Array(NUMITEMS).fill(0n);
    items[I_FOOD] = 10n;
    const result = await (service.command.handler(makeShip({ items }), ['cargo'], {}) as Promise<CommandResult>);
    expect(result.lines.some(l => l.text.includes(capitaliseItem(ITEM_NAMES[I_FOOD])))).toBe(true);
  });

  it('non-zero item does not show REP_CARGO_NONE', async () => {
    const { service } = makeService();
    const items = Array(NUMITEMS).fill(0n);
    items[I_FOOD] = 5n;
    const result = await (service.command.handler(makeShip({ items }), ['cargo'], {}) as Promise<CommandResult>);
    expect(result.lines.some(l => l.text === formatMessage(MessageId.REP_CARGO_NONE))).toBe(false);
  });

  it('REP_CARGO_TOTAL reflects correct tonnage for loaded cargo', async () => {
    const { service } = makeService();
    const items = Array(NUMITEMS).fill(0n);
    items[I_FOOD] = 10n; // 10 * ITEM_TONS[I_FOOD] tons
    const expectedTons = Math.round(10 * ITEM_TONS[I_FOOD]);
    const result = await (service.command.handler(makeShip({ items }), ['cargo'], {}) as Promise<CommandResult>);
    const totalLine = result.lines.find(l => l.text.includes('Total:'));
    expect(totalLine?.text).toContain(String(expectedTons));
  });

  it('multiple items each show a REP_CARGO_LINE', async () => {
    const { service } = makeService();
    const items = Array(NUMITEMS).fill(0n);
    items[I_FOOD] = 10n;
    items[I_MEN] = 5n;
    const result = await (service.command.handler(makeShip({ items }), ['cargo'], {}) as Promise<CommandResult>);
    const cargoLines = result.lines.filter(l =>
      l.text.includes(capitaliseItem(ITEM_NAMES[I_FOOD])) || l.text.includes(capitaliseItem(ITEM_NAMES[I_MEN])),
    );
    expect(cargoLines).toHaveLength(2);
  });

  it('zero-quantity items are not listed', async () => {
    const { service } = makeService();
    const items = Array(NUMITEMS).fill(0n);
    items[I_FOOD] = 10n;
    const result = await (service.command.handler(makeShip({ items }), ['cargo'], {}) as Promise<CommandResult>);
    // I_MEN is 0 — should not appear
    expect(result.lines.some(l => l.text.includes(capitaliseItem(ITEM_NAMES[I_MEN])))).toBe(false);
  });

  it('header contains REP01 with ship name', async () => {
    const { service } = makeService();
    const result = await (service.command.handler(makeShip(), ['cargo'], {}) as Promise<CommandResult>);
    expect(result.lines[0].text).toContain('USS Test');
  });
});
