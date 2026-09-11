/**
 * An AI torpedo has to pass the same lock check a player's does.
 *
 * Canon has ONE torpedo path. The player's `tor` runs `cmd_torp` for its
 * command-level gates and then calls `torp()`; a Cybertron calls `torp()` at
 * GECYBS.C:538 and a Droid at GEDROIDS.C:482. The first line of `torp()` is
 * `if (lockon(ptr,0,shpnum,usrn) == 1)`, so every torpedo in the game — AI or
 * player — is gated by the same arithmetic:
 *
 *   if (wptr->speed > 999)  fact = 0;                    // target at warp
 *   else fact = (1.2 - (firer.speed + target.speed)/5000)
 *             * ((5.0 - dist) / tor_fact);
 *   ... lock succeeds only when fact > 0.7               // GECMDS.C:1378-1395
 *
 * The port's `cybLaunchTorpedo` wrote straight into the victim's `ltorps`
 * arrays with no lock test at all, so a Cybertron could fire at any speed,
 * any range, through a jammer. Found in play: a Sarten Obliterator at warp
 * 14.03 put six torpedoes into a Dreadnought over a 3.5-sector approach and
 * killed it. Canon's speed term at that velocity is
 * `1.2 - 14030/5000 = -1.61`, so the product is negative before distance is
 * even considered and not one of those torpedoes exists.
 *
 * The two rules that follow are worth stating because they are the whole of
 * torpedo tactics: a ship at warp 1 or above CANNOT be hit by a torpedo, and
 * a ship above roughly warp 3.5 cannot fire one.
 *
 * @see GECYBS.C:538, GEDROIDS.C:482, GECMDS.C:1188 torp -> lockon
 */

import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Random } from '../../../src/game/combat/random.port';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS, I_TORP } from '../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'S',
    xcoord: 5,
    ycoord: 5,
    energy: 50_000,
    phasr: 100,
    phasrtype: 2,
    shieldtype: 1,
    ltorpsChannel: [255, 255, 255],
    ltorpsDistance: [0, 0, 0],
    items: Array.from({ length: NUMITEMS }, () => 0n),
    cybmine: 255,
    cybskill: 5,
    topspeed: 8,
    userKills: 6,
    ...over,
  });
}

/** Draw 1 fails the phaser roll, draw 2 passes the torp roll, draw 3 asks for torpedoes. */
function firingRandom(): Random {
  const v = [0.5, 0.1, 0.9];
  let i = 0;
  return { next: () => (i < v.length ? v[i++] : 0.999) } as Random;
}

function harness(rand: Random, ships: ShipState[]) {
  const events = new EventEmitter2();
  const shipState = {
    findAllShips: () => ships,
    findByUserid: () => [],
    get: () => undefined,
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = ships.find((x) => x.userid === userid && x.shipno === shipno);
      if (s) fn(s);
    },
    loadShip: () => {}, removeFromGame: () => {}, size: () => ships.length,
  } as unknown as ShipStateService;

  const svc = new CybertronTickService(
    { subscribe: () => () => {} } as unknown as TickService,
    shipState,
    {
      get: () => ({ hasTorpedo: true, hasZipper: false, scanRange: 50_000, maxTons: 900 }),
      getMaxTons: () => 900,
      getTypeName: () => 'Cybertron Scout',
    } as unknown as ShipClassCacheService,
    {
      hydrateAll: jest.fn().mockResolvedValue(undefined),
      clampCybertronCash: (n: bigint) => n,
    } as unknown as CybertronRepository,
    events,
    rand,
  );
  return { svc };
}

function attack(cyb: ShipState, target: ShipState, ddistRaw: number, ships: ShipState[]): void {
  const { svc } = harness(firingRandom(), ships);
  (svc as unknown as {
    cybAttack: (s: ShipState, t: ShipState, tough: number, d: number, c: unknown) => void;
  }).cybAttack(cyb, target, 0, ddistRaw, { firedAt: new Date() });
}

function torpedoesQueued(target: ShipState): number {
  return target.ltorpsChannel.filter((c) => c !== undefined && c !== 255).length;
}

function cybertron(over: Partial<ShipState> = {}): ShipState {
  const c = makeShip({ userid: 'Cybrg-7', shipno: 7, shpclass: 21, status: 2, channel: 7, ...over } as Partial<ShipState>);
  c.items = [...c.items];
  c.items[I_TORP] = 5n;
  return c;
}

describe('an AI torpedo passes the same lock check as a player one', () => {
  it('fires when both ships are slow and close — the baseline that must keep working', () => {
    // 0.1 sectors apart, both stationary: fact = 1.2 * ((5-0.1)/4) = 1.47 > 0.7.
    const cyb = cybertron();
    const player = makeShip({ userid: 'p1', shipno: 1, xcoord: 5.1, ycoord: 5 });
    attack(cyb, player, 1000, [cyb, player]);
    expect(torpedoesQueued(player)).toBeGreaterThan(0);
  });

  it('does NOT fire while the attacker is at warp — the bug that killed a Dreadnought', () => {
    // Warp 14.03, exactly what the Obliterator was doing. The speed term alone
    // is 1.2 - 14030/5000 = -1.61, so no distance can rescue it.
    const cyb = cybertron({ speed: 14_030 });
    const player = makeShip({ userid: 'p1', shipno: 1, xcoord: 5.1, ycoord: 5 });
    attack(cyb, player, 1000, [cyb, player]);
    expect(torpedoesQueued(player)).toBe(0);
  });

  it('does NOT fire above roughly warp 3.5, where the speed term reaches zero', () => {
    const cyb = cybertron({ speed: 4_000 });
    const player = makeShip({ userid: 'p1', shipno: 1, xcoord: 5.1, ycoord: 5 });
    attack(cyb, player, 1000, [cyb, player]);
    expect(torpedoesQueued(player)).toBe(0);
  });

  it('does NOT fire at a target that is itself at warp, however slow the attacker', () => {
    // `if (wptr->speed > 999) fact = 0` — a hard zero on the TARGET's speed,
    // independent of everything else. This is why canon's help tells a pilot
    // to keep moving.
    const cyb = cybertron();
    const player = makeShip({ userid: 'p1', shipno: 1, xcoord: 5.1, ycoord: 5, speed: 1_000 });
    attack(cyb, player, 1000, [cyb, player]);
    expect(torpedoesQueued(player)).toBe(0);
  });

  it('does NOT fire from beyond the lock envelope even at a dead stop', () => {
    // Stationary attacker reaches 2.67 sectors. At 3.5 the term is
    // 1.2 * ((5-3.5)/4) = 0.45, under the 0.7 threshold.
    const cyb = cybertron();
    const player = makeShip({ userid: 'p1', shipno: 1, xcoord: 8.5, ycoord: 5 });
    attack(cyb, player, 35_000, [cyb, player]);
    expect(torpedoesQueued(player)).toBe(0);
  });
});
