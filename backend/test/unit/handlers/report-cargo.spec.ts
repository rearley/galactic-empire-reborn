/**
 * T057 — ReportHandlerService cargo sub-command tests.
 */
import { CommandResult } from '../../../src/game/commands/command.types';
import { ReportHandlerService } from '../../../src/game/commands/handlers/report.handler';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, I_FOOD, I_MEN, ITEM_NAMES, ITEM_TONS } from '../../../src/game/constants/items';

const MAX_TONS = 500;

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'USS Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 3.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(maxTons = MAX_TONS) {
  const prismaMock = {
    shipClass: {
      findMany: jest.fn().mockResolvedValue([
        { classNumber: 1, typeName: 'Interceptor', hasCloak: false, maxTons },
      ]),
    },
  };
  const service = new ReportHandlerService(prismaMock as unknown as PrismaService);
  return { service };
}

describe('ReportHandlerService — cargo sub-command', () => {
  it('empty cargo shows REP_CARGO_NONE', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    const result = service.command.handler(makeShip(), ['cargo'], {}) as CommandResult;
    expect(result.lines.some(l => l.text === formatMessage(MessageId.REP_CARGO_NONE))).toBe(true);
  });

  it('always includes REP_CARGO_TOTAL line', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    const result = service.command.handler(makeShip(), ['cargo'], {}) as CommandResult;
    expect(result.lines.some(l => l.text.includes('Total:'))).toBe(true);
  });

  it('REP_CARGO_TOTAL shows capacity from ship class', async () => {
    const { service } = makeService(250);
    await service.onModuleInit();
    const result = service.command.handler(makeShip(), ['cargo'], {}) as CommandResult;
    const totalLine = result.lines.find(l => l.text.includes('Total:'));
    expect(totalLine?.text).toContain('250');
  });

  it('non-zero item shows REP_CARGO_LINE with item name', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    const items = Array(NUMITEMS).fill(0n);
    items[I_FOOD] = 10n;
    const result = service.command.handler(makeShip({ items }), ['cargo'], {}) as CommandResult;
    expect(result.lines.some(l => l.text.includes(ITEM_NAMES[I_FOOD]))).toBe(true);
  });

  it('non-zero item does not show REP_CARGO_NONE', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    const items = Array(NUMITEMS).fill(0n);
    items[I_FOOD] = 5n;
    const result = service.command.handler(makeShip({ items }), ['cargo'], {}) as CommandResult;
    expect(result.lines.some(l => l.text === formatMessage(MessageId.REP_CARGO_NONE))).toBe(false);
  });

  it('REP_CARGO_TOTAL reflects correct tonnage for loaded cargo', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    const items = Array(NUMITEMS).fill(0n);
    items[I_FOOD] = 10n; // 10 * ITEM_TONS[I_FOOD] tons
    const expectedTons = Math.round(10 * ITEM_TONS[I_FOOD]);
    const result = service.command.handler(makeShip({ items }), ['cargo'], {}) as CommandResult;
    const totalLine = result.lines.find(l => l.text.includes('Total:'));
    expect(totalLine?.text).toContain(String(expectedTons));
  });

  it('multiple items each show a REP_CARGO_LINE', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    const items = Array(NUMITEMS).fill(0n);
    items[I_FOOD] = 10n;
    items[I_MEN] = 5n;
    const result = service.command.handler(makeShip({ items }), ['cargo'], {}) as CommandResult;
    const cargoLines = result.lines.filter(l =>
      l.text.includes(ITEM_NAMES[I_FOOD]) || l.text.includes(ITEM_NAMES[I_MEN]),
    );
    expect(cargoLines).toHaveLength(2);
  });

  it('zero-quantity items are not listed', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    const items = Array(NUMITEMS).fill(0n);
    items[I_FOOD] = 10n;
    const result = service.command.handler(makeShip({ items }), ['cargo'], {}) as CommandResult;
    // I_MEN is 0 — should not appear
    expect(result.lines.some(l => l.text.includes(ITEM_NAMES[I_MEN]))).toBe(false);
  });

  it('header contains REP01 with ship name', async () => {
    const { service } = makeService();
    await service.onModuleInit();
    const result = service.command.handler(makeShip(), ['cargo'], {}) as CommandResult;
    expect(result.lines[0].text).toContain('USS Test');
  });
});
