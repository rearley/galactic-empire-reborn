/**
 * Unit tests for CloakHandlerService.
 * @see GECMDS.C:3188 cmd_cloak
 * @see contracts/commands.md §cloak
 */
import { CloakHandlerService } from '../../../../src/game/commands/handlers/cloak.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../../src/game/commands/command.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { CLOAK_ENERGY_USE_DEFAULT } from '../../../../src/game/commands/cloak.config';
import { CLOAK_RAMP_INIT } from '../../../../src/game/commands/_ship-management-constants';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    dirty: false,
    ...overrides,
  };
}

function makeService(shipState?: Partial<ShipState>) {
  const state = makeShip(shipState);
  const mutated: Partial<ShipState> = {};
  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        fn(state);
        Object.assign(mutated, state);
        return state;
      },
    ),
  } as unknown as ShipStateService;

  const handler = new CloakHandlerService(mockShipState, CLOAK_ENERGY_USE_DEFAULT);
  const ctx: CommandContext = {};
  return { handler, state, mockShipState, mutated, ctx };
}

describe('CloakHandlerService', () => {
  describe('cloak on — happy path', () => {
    it('sets cloak = CLOAK_RAMP_INIT (1) on success', () => {
      const { handler, state, ctx } = makeService({ cloak: 0, energy: 10000 });
      handler.command.handler(state, ['on'], ctx);
      expect(state.cloak).toBe(CLOAK_RAMP_INIT);
    });

    it('debits CLOAK_ENERGY_USE from energy', () => {
      const { handler, state, ctx } = makeService({ cloak: 0, energy: 10000 });
      handler.command.handler(state, ['on'], ctx);
      expect(state.energy).toBe(10000 - CLOAK_ENERGY_USE_DEFAULT);
    });

    it('returns CLOAK_ENGAGED success line (SC-007 — player-visible event on happy path)', () => {
      const { handler, state, ctx } = makeService({ cloak: 0, energy: 10000 });
      const result = handler.command.handler(state, ['on'], ctx);
      const lines = (result as { lines: { text: string }[] }).lines;
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0].text).toBe(formatMessage(MessageId.CLOAK_ENGAGED));
    });

    it('boundary: energy exactly equal to CLOAK_ENERGY_USE → cloak fails (energy must be > not >=)', () => {
      const { handler, state, ctx } = makeService({ cloak: 0, energy: CLOAK_ENERGY_USE_DEFAULT });
      const result = handler.command.handler(state, ['on'], ctx) as { lines: { text: string }[] };
      expect(result.lines[0].text).toBe(formatMessage(MessageId.CLOAK_NO_ENERGY));
    });

    it('boundary: energy = CLOAK_ENERGY_USE + 1 → cloak succeeds', () => {
      const { handler, state, ctx } = makeService({ cloak: 0, energy: CLOAK_ENERGY_USE_DEFAULT + 1 });
      handler.command.handler(state, ['on'], ctx);
      expect(state.cloak).toBe(CLOAK_RAMP_INIT);
    });
  });

  describe('cloak on — rejection paths', () => {
    it('already cloaked (cloak > 0) → CLOAK_ALREADY_ON, no mutation', () => {
      const { handler, state, mockShipState, ctx } = makeService({ cloak: 1 });
      const result = handler.command.handler(state, ['on'], ctx) as { lines: { text: string }[] };
      expect(result.lines[0].text).toBe(formatMessage(MessageId.CLOAK_ALREADY_ON));
      expect(mockShipState.mutate).not.toHaveBeenCalled();
    });

    it('damaged cloak (cloak < 0) → CLOAK_DAMAGED', () => {
      const { handler, state, ctx } = makeService({ cloak: -3 });
      const result = handler.command.handler(state, ['on'], ctx) as { lines: { text: string }[] };
      expect(result.lines[0].text).toBe(formatMessage(MessageId.CLOAK_DAMAGED));
    });

    it('hyperspace (where == 1) → CLOAK_HYPERSPACE', () => {
      const { handler, state, ctx } = makeService({ cloak: 0, where: 1 });
      const result = handler.command.handler(state, ['on'], ctx) as { lines: { text: string }[] };
      expect(result.lines[0].text).toBe(formatMessage(MessageId.CLOAK_HYPERSPACE));
    });

    it('insufficient energy → CLOAK_NO_ENERGY', () => {
      const { handler, state, ctx } = makeService({ cloak: 0, energy: 1 });
      const result = handler.command.handler(state, ['on'], ctx) as { lines: { text: string }[] };
      expect(result.lines[0].text).toBe(formatMessage(MessageId.CLOAK_NO_ENERGY));
    });
  });

  describe('cloak off — happy path', () => {
    it('sets cloak = 0 on success', () => {
      const { handler, state, ctx } = makeService({ cloak: 10 });
      handler.command.handler(state, ['off'], ctx);
      expect(state.cloak).toBe(0);
    });

    it('returns CLOAK_DISENGAGED success line (SC-007)', () => {
      const { handler, state, ctx } = makeService({ cloak: 10 });
      const result = handler.command.handler(state, ['off'], ctx) as { lines: { text: string }[] };
      expect(result.lines[0].text).toBe(formatMessage(MessageId.CLOAK_DISENGAGED));
    });

    it('broadcasts sector decloaked event', () => {
      const { handler, state, ctx } = makeService({ cloak: 10, xcoord: 5.3, ycoord: 7.8 });
      const result = handler.command.handler(state, ['off'], ctx) as { lines: unknown[]; broadcasts?: { room: string; event: string }[] };
      expect(result.broadcasts).toBeDefined();
      expect(result.broadcasts![0].room).toBe('sector:5:7');
      expect(result.broadcasts![0].event).toBe('event.log');
    });
  });

  describe('cloak off — rejection paths', () => {
    it('not cloaked (cloak == 0) → CLOAK_ALREADY_OFF', () => {
      const { handler, state, ctx } = makeService({ cloak: 0 });
      const result = handler.command.handler(state, ['off'], ctx) as { lines: { text: string }[] };
      expect(result.lines[0].text).toBe(formatMessage(MessageId.CLOAK_ALREADY_OFF));
    });

    it('negative cloak (damaged) treated as off', () => {
      const { handler, state, ctx } = makeService({ cloak: -2 });
      const result = handler.command.handler(state, ['off'], ctx) as { lines: { text: string }[] };
      expect(result.lines[0].text).toBe(formatMessage(MessageId.CLOAK_ALREADY_OFF));
    });
  });

  describe('usage errors', () => {
    it('invalid sub-form → CLOAK_FMT', () => {
      const { handler, state, ctx } = makeService();
      const result = handler.command.handler(state, ['sideways'], ctx) as { lines: { text: string }[] };
      expect(result.lines[0].text).toBe(formatMessage(MessageId.CLOAK_FMT));
    });

    it('keyword and aliases', () => {
      const { handler } = makeService();
      expect(handler.command.keyword).toBe('cloak');
      expect(handler.command.aliases).toContain('clo');
      expect(handler.command.minArgs).toBe(1);
    });
  });
});
