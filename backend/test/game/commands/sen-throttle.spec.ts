import { SenHandlerService } from '../../../src/game/commands/handlers/sen.handler';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandResult } from '../../../src/game/commands/command.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { CHAT_BURST } from '../../../src/game/commands/handlers/helpers/chat-throttle';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

/**
 * `sen` throttled at the handler, so a flood cannot reach other players' logs.
 * @see src/game/commands/handlers/helpers/chat-throttle.ts
 */
function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Talker',
    xcoord: 5,
    ycoord: 3,
    items: new Array(NUMITEMS).fill(0n),
    ...over,
  });
}

describe('`sen` is rate limited', () => {
  const send = (svc: SenHandlerService, ship: ShipState) =>
    svc.command.handler(ship, ['a', 'hello there'], {}) as CommandResult;

  it('never blocks a real conversation', () => {
    // One line every two seconds for a minute — nobody types faster than this
    // for long, and none of it may be refused.
    let clock = 0;
    const svc = new SenHandlerService(() => clock);
    const ship = makeShip();

    for (let i = 0; i < 30; i++) {
      clock += 2_000;
      expect(send(svc, ship).broadcasts ?? []).not.toHaveLength(0);
    }
  });

  it('stops a flood after the burst', () => {
    let clock = 1_000;
    const svc = new SenHandlerService(() => clock);
    const ship = makeShip();

    for (let i = 0; i < CHAT_BURST; i++) { clock += 1; send(svc, ship); }
    clock += 1;
    const blocked = send(svc, ship);

    expect(blocked.broadcasts ?? []).toHaveLength(0);
    expect(blocked.lines[0].text).toMatch(/too fast|slow down/i);
  });

  it('throttles each pilot separately', () => {
    // One player shouting must not silence anyone else.
    let clock = 1_000;
    const svc = new SenHandlerService(() => clock);
    const loud = makeShip({ userid: 'loud' });
    const quiet = makeShip({ userid: 'quiet' });

    for (let i = 0; i < CHAT_BURST + 2; i++) { clock += 1; send(svc, loud); }
    const other = send(svc, quiet);

    expect(other.broadcasts ?? []).not.toHaveLength(0);
  });

  it('forgives once the window passes', () => {
    let clock = 1_000;
    const svc = new SenHandlerService(() => clock);
    const ship = makeShip();

    for (let i = 0; i < CHAT_BURST; i++) { clock += 1; send(svc, ship); }
    clock += 10_000;

    expect(send(svc, ship).broadcasts ?? []).not.toHaveLength(0);
  });
});
