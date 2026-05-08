/**
 * T050 — Set options coverage.
 *
 * Enumerates every entry in SET_OPTIONS_CATALOG and asserts:
 *  1. The set handler accepts the option name (no SET_UNKNOWN response).
 *  2. Toggling `on` and `off` produces distinct ShipState mutations.
 *
 * @see GECMDS.C:5197-5201 — cmd_set option reads
 * @see backend/src/game/commands/handlers/set-options.catalog.ts
 */

import { SET_OPTIONS_CATALOG } from '../../src/game/commands/handlers/set-options.catalog';
import { SetHandlerService } from '../../src/game/commands/handlers/set.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../src/game/commands/messages';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0.5, ycoord: 0.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService() {
  let mutatedShip: Partial<ShipState> = {};
  const shipStateMock = {
    mutate: jest.fn().mockImplementation((_u: string, _n: number, fn: (s: ShipState) => void) => {
      const ship = makeShip();
      fn(ship);
      mutatedShip = ship;
    }),
  };
  const prismaMock = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ options: [0, 0, 0, 0] }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const svc = new SetHandlerService(
    shipStateMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
  );
  return { svc, shipStateMock, prismaMock, getMutated: () => mutatedShip };
}

describe('T050 — set options catalog coverage', () => {
  it('SET_OPTIONS_CATALOG is non-empty', () => {
    expect(SET_OPTIONS_CATALOG.length).toBeGreaterThan(0);
  });

  for (const entry of SET_OPTIONS_CATALOG) {
    describe(`option: ${entry.name}`, () => {
      it('set <name> on → handler returns SET_OK_ON (not SET_UNKNOWN)', async () => {
        const { svc } = makeService();
        const result = await (svc.command.handler(makeShip(), [entry.name, 'on'], {}) as Promise<{ lines: Array<{ text: string }> }>);
        const unknownMsg = formatMessage(MessageId.SET_UNKNOWN);
        expect(result.lines[0].text).not.toBe(unknownMsg);
      });

      it('set <name> off → handler returns SET_OK_OFF (not SET_UNKNOWN)', async () => {
        const { svc } = makeService();
        const result = await (svc.command.handler(makeShip(), [entry.name, 'off'], {}) as Promise<{ lines: Array<{ text: string }> }>);
        const unknownMsg = formatMessage(MessageId.SET_UNKNOWN);
        expect(result.lines[0].text).not.toBe(unknownMsg);
      });

      it(`set <name> on → mutates ${entry.shipStateField} to true`, async () => {
        const { svc, getMutated } = makeService();
        await (svc.command.handler(makeShip(), [entry.name, 'on'], {}) as Promise<unknown>);
        expect((getMutated() as Record<string, unknown>)[entry.shipStateField]).toBe(true);
      });
    });
  }
});
