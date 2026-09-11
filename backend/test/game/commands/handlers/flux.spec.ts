import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { fluxCommand } from '../../../../src/game/commands/handlers/flux.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { ENGYMAX } from '../../../../src/game/constants';
import { I_FLUX } from '../../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

function itemsWith(map: Record<number, bigint>): bigint[] {
  const arr: bigint[] = [];
  for (let i = 0; i < 14; i++) arr.push(0n);
  for (const [k, v] of Object.entries(map)) arr[Number(k)] = v;
  return arr;
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'T',
    energy: 100,
    items: itemsWith({ [I_FLUX]: 2n }),
    lock: -1,
    topspeed: 10,
    ...over,
  });
}

const ctx: CommandContext = {};

describe('fluxCommand — `flux`', () => {
  it('happy path: consumes one pod, restores energy to ENGYMAX', () => {
    const s = makeShip({ energy: 100, items: itemsWith({ [I_FLUX]: 2n }) });
    const result = fluxCommand.handler(s, [], ctx) as CommandResult;
    expect(s.items[I_FLUX]).toBe(1n);
    expect(s.energy).toBe(ENGYMAX);
    expect(s.dirty).toBe(true);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.FLUX_USED));
  });

  it('rejects when no flux pods (FLUX_NOPODS)', () => {
    const s = makeShip({ energy: 100, items: itemsWith({ [I_FLUX]: 0n }) });
    const result = fluxCommand.handler(s, [], ctx) as CommandResult;
    expect(s.items[I_FLUX]).toBe(0n);
    expect(s.energy).toBe(100); // unchanged
    expect(result.lines[0].text).toBe(formatMessage(MessageId.FLUX_NOPODS));
  });

  /**
   * GECMDS.C:748 — C prints LASTFLUX after FLUXLOAD when the pod just spent was
   * the last one. Without it a pilot only discovers the locker is empty the next
   * time they are out of energy and need it.
   */
  it('warns when the pod just used was the last one', () => {
    const s = makeShip({ energy: 100, items: itemsWith({ [I_FLUX]: 1n }) });
    const result = fluxCommand.handler(s, [], ctx) as CommandResult;
    expect(s.items[I_FLUX]).toBe(0n);
    expect(result.lines.map((l) => l.text)).toEqual([
      formatMessage(MessageId.FLUX_USED),
      formatMessage(MessageId.FLUX_LAST),
    ]);
  });

  it('does not warn while pods remain', () => {
    const s = makeShip({ energy: 100, items: itemsWith({ [I_FLUX]: 2n }) });
    const result = fluxCommand.handler(s, [], ctx) as CommandResult;
    expect(result.lines).toHaveLength(1);
  });

  it('still consumes pod even if energy already at max (no short-circuit)', () => {
    const s = makeShip({ energy: ENGYMAX, items: itemsWith({ [I_FLUX]: 3n }) });
    fluxCommand.handler(s, [], ctx);
    expect(s.items[I_FLUX]).toBe(2n);
    expect(s.energy).toBe(ENGYMAX);
  });
});
