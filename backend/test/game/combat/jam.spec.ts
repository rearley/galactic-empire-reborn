/**
 * Canon has one `jam()`, and the player's `jam`, a Cybertron and a Droid all
 * call it. It blinds every ship in the game within the jammer's scan range, the
 * nearer the longer, the jammer included; spends one jammer; and battle-locks
 * the jammer:
 *
 *   GECMDS.C:1644 `wptr->jammer = (unsigned)(((double)jamtime)*ddist);`
 *   GECMDS.C:1649 `--ptr->items[I_JAMMERS];`
 *   GECMDS.C:1650 `ptr->cantexit = FIRETICKS;`
 *
 * Canon reads the range off `warsptr`, the CURRENT user's ship; from the AI
 * loop that is whoever it last pointed at. The evident intent is the jammer's
 * own class. @see src/game/combat/jam.ts, #65
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { applyJam } from '../../../src/game/combat/jam';
import { AiWeapons } from '../../../src/game/ai/ai-weapons';
import { COMBAT_TARGET_WARNING } from '../../../src/game/combat/combat-events';
import { FIRETICKS, GESTAT_AUTO, JAMTIME } from '../../../src/game/constants';
import { I_JAMMER } from '../../../src/game/constants/items';
import { jammerCounter } from '../../../src/game/combat/combat-math';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import type { ShipStateService } from '../../../src/game/ship/ship-state.service';
import type { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { makeShip } from '../../helpers/make-ship';

const RANGE = 20_000; // two sectors

function world() {
  const jammer = makeShip({ userid: 'Cybrg-205', shipno: 205, status: GESTAT_AUTO, channel: 9, xcoord: 5, ycoord: 5, cantexit: 0 });
  jammer.items[I_JAMMER] = 3n;
  const near = makeShip({ userid: 'p1', shipno: 1, status: 1, channel: 1, xcoord: 5.5, ycoord: 5 });
  const far = makeShip({ userid: 'p2', shipno: 1, status: 1, channel: 2, xcoord: 8, ycoord: 5 });
  const ships = [jammer, near, far];
  const shipState = {
    findAllShips: () => ships,
    mutate: (u: string, n: number, fn: (s: ShipState) => void) => { const s = ships.find((x) => x.userid === u && x.shipno === n); if (s) fn(s); return s; },
  } as unknown as ShipStateService;
  const classes = { getScanRange: () => RANGE, get: () => ({ scanRange: RANGE }) } as unknown as ShipClassCacheService;
  const events = new EventEmitter2();
  const warned: string[] = [];
  events.on(COMBAT_TARGET_WARNING, (e: { victimId: string; kind: string }) => { if (e.kind === 'scanners-jammed') warned.push(e.victimId); });
  return { jammer, near, far, shipState, classes, events, warned };
}

describe('applyJam — canon jam()', () => {
  it('blinds every ship within the jammer\'s range, the nearer the longer, the jammer included', () => {
    const w = world();
    applyJam(w.jammer, w.shipState, w.classes, w.events);
    expect(w.near.jammer).toBe(jammerCounter(5_000, RANGE, JAMTIME));
    expect(w.jammer.jammer).toBe(JAMTIME);
    expect(w.far.jammer).toBe(0);
    expect(w.warned.sort()).toEqual(['Cybrg-205:205', 'p1:1']);
  });

  it('spends one jammer and battle-locks the jammer', () => {
    const w = world();
    applyJam(w.jammer, w.shipState, w.classes, w.events);
    expect(w.jammer.items[I_JAMMER]).toBe(2n);
    expect(w.jammer.cantexit).toBe(FIRETICKS);
  });
});

describe('AiWeapons.jam is the same jam', () => {
  it('jams a player in range with the AI\'s own class range', () => {
    const w = world();
    const weapons = new AiWeapons({
      shipState: w.shipState, classes: w.classes, events: w.events,
      random: { next: () => 0.5 }, logger: { error: vi.fn() } as never,
    });
    weapons.jam(w.jammer);
    expect(w.near.jammer).toBeGreaterThan(0);
    expect(w.jammer.items[I_JAMMER]).toBe(2n);
  });
});
