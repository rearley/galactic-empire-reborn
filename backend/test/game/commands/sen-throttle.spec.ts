import { SenHandlerService } from '../../../src/game/commands/handlers/sen.handler';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandResult } from '../../../src/game/commands/command.types';
import { NUMITEMS } from '../../../src/game/constants/items';
import { CHAT_BURST } from '../../../src/game/commands/handlers/helpers/chat-throttle';

/**
 * `sen` throttled at the handler, so a flood cannot reach other players' logs.
 * @see src/game/commands/handlers/helpers/chat-throttle.ts
 */
function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Talker', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 3, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  } as ShipState;
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
