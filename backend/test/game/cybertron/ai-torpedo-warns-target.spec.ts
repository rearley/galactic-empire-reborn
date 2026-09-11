/**
 * An AI torpedo announces itself to the ship it is aimed at.
 *
 * Canon's `torp()` tells BOTH sides as the tube fires:
 *
 *   prfmsg(TFIRE1);                       outprfge(FILTER,usrn);   // firer
 *   prfmsg(TFIRE2,shpltr(shpnum,usrn));   outprfge(FILTER,shpnum); // TARGET
 *   -- GECMDS.C:1195-1199
 *
 * TFIRE2 is "WARNING! WARNING! Incoming torpedo from ship %c."
 *
 * `cybLaunchTorpedo` wrote the torpedo into the victim's `ltorps` slots and
 * emitted nothing at all, so a Cybertron's volley arrived in total silence —
 * the first a pilot knew of it was the hit. The gateway already maps
 * `torpedo-launched` to TORP_INBOUND (game.gateway COMBAT_TARGET_WARNING);
 * only the AI path never raised it.
 *
 * Canon's own `lockwarn` handling shows the warning is per-VOLLEY, not
 * per-torpedo: `if (i>0) lockwarn = FALSE;` (GECYBS.C:537) suppresses it for
 * every torpedo after the first, so a six-torpedo volley warns once.
 *
 * @see docs/DECISIONS.md 2026-09-06
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
import { COMBAT_TARGET_WARNING } from '../../../src/game/combat/combat-events';
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

function harness(rand: Random, ships: ShipState[]) {
  const events = new EventEmitter2();
  const warnings: Array<{ kind: string; victimId: string }> = [];
  events.on(COMBAT_TARGET_WARNING, (e: { kind: string; victimId: string }) => warnings.push(e));

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
  return { svc, warnings };
}

describe('an AI torpedo warns the ship it is aimed at (GECMDS.C:1198)', () => {
  it('raises a torpedo-launched warning addressed to the target', () => {
    // Draw 1 (phaser roll) fails; draw 2 (torp roll) succeeds; draw 3 -> 1 torp.
    const rand = { next: (() => { const v = [0.5, 0.1, 0.9]; let i = 0; return () => (i < v.length ? v[i++] : 0.999); })() } as Random;

    const cyb = makeShip({ userid: 'Cybrg-7', shipno: 7, shpclass: 21, status: 2, channel: 7 } as Partial<ShipState>);
    cyb.items = [...cyb.items];
    cyb.items[I_TORP] = 5n;
    const player = makeShip({ userid: 'p1', shipno: 1, xcoord: 5.1, ycoord: 5 });

    const { svc, warnings } = harness(rand, [cyb, player]);
    (svc as unknown as {
      cybAttack: (s: ShipState, t: ShipState, tough: number, d: number, c: unknown) => void;
    }).cybAttack(cyb, player, 0, 1000, { firedAt: new Date() });

    const launched = warnings.filter((w) => w.kind === 'torpedo-launched');
    expect(launched).toHaveLength(1);
    expect(launched[0].victimId).toContain('p1');
  });
});
