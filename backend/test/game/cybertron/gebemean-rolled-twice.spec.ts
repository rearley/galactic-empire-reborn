/**
 * Canon rolls `gebemean` SEPARATELY for phasers and for torpedoes.
 *
 *   if (ptr->phasr >= PMINFIRE && gebemean(ptr,zothusn))   // GECYBS.C:514
 *       { if (!cybwhoops(ptr,zothusn)) firep(ptr,usrn); }
 *
 *   j = gernd()%6; ...
 *   if (!gebemean(ptr,zothusn))                            // GECYBS.C:527
 *       j = 0;
 *
 * Two calls, two independent draws. The port evaluated it once and reused the
 * result for both, with a comment claiming that "preserves deterministic PRNG
 * consumption" — which has it backwards: matching canon MEANS consuming the
 * generator the way canon consumes it, twice.
 *
 * The effect is not cosmetic. For an ordinary Cybertron against a player under
 * CYB_BE_NICE kills, `gebemean` is a 1-in-CYBSLO (1-in-3) roll:
 *
 *   canon:  P(phasers) = 1/3, P(torps) = 1/3, independent
 *           P(does ANYTHING) = 1 - (2/3)(2/3) = 5/9 = 56%
 *   port:   one roll drives both
 *           P(does ANYTHING) = 1/3 = 33%
 *
 * So Cybertron Scouts engaged at 0.6x canon's rate, and a player who had not
 * yet passed 30 kills could farm them nearly unopposed. Reported from play:
 * "AI has not really fought back... no torpedo, no phasers, just let me kill
 * it" — against Scouts, at 6 kills.
 *
 * @see docs/DECISIONS.md 2026-09-06 — gebemean is rolled once per weapon
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
  const items = Array.from({ length: NUMITEMS }, () => 0n);
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
    items: items,
    cybmine: 255,
    cybskill: 5,
    topspeed: 8,
    userKills: 6,
    ...over,
  });
}

/** Draws in order, then 0.999 forever. */
function scripted(values: number[]): Random {
  let i = 0;
  return { next: () => (i < values.length ? values[i++] : 0.999) } as Random;
}

function harness(rand: Random, ships: ShipState[]) {
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
      hydrateAll: vi.fn().mockResolvedValue(undefined),
      clampCybertronCash: (n: bigint) => n,
    } as unknown as CybertronRepository,
    new EventEmitter2(),
    rand,
  );
  return svc;
}

describe('gebemean is rolled once per WEAPON (GECYBS.C:514, :527)', () => {
  it('still fires torpedoes when the phaser roll came up not-mean', () => {
    // Draw 1 -> 0.5: floor(0.5*3)=1, not 0, so the PHASER roll fails.
    // Draw 2 -> 0.1: floor(0.1*3)=0, so the TORPEDO roll succeeds.
    // Draw 3 -> 0.9: floor(0.9*2)=1 torpedo in the volley.
    const rand = scripted([0.5, 0.1, 0.9]);

    const cyb = makeShip({
      userid: 'Cybrg-7', shipno: 7, shpclass: 21, status: 2, channel: 7,
    } as Partial<ShipState>);
    cyb.items = [...cyb.items];
    cyb.items[I_TORP] = 5n;
    const player = makeShip({ userid: 'p1', shipno: 1, xcoord: 5.1, ycoord: 5 });

    const svc = harness(rand, [cyb, player]);
    ((svc as unknown as { brain: unknown }).brain as {
      cybAttack: (s: ShipState, t: ShipState, tough: number, d: number, c: unknown) => void;
    }).cybAttack(cyb, player, 0, 1000, { firedAt: new Date() });

    // A torpedo is queued by writing the firer's channel into a free slot.
    expect(player.ltorpsChannel).toContain(7);
  });

  it('fires nothing when BOTH rolls come up not-mean', () => {
    const rand = scripted([0.5, 0.5]);

    const cyb = makeShip({
      userid: 'Cybrg-7', shipno: 7, shpclass: 21, status: 2, channel: 7,
    } as Partial<ShipState>);
    cyb.items = [...cyb.items];
    cyb.items[I_TORP] = 5n;
    const player = makeShip({ userid: 'p1', shipno: 1, xcoord: 5.1, ycoord: 5 });

    const svc = harness(rand, [cyb, player]);
    ((svc as unknown as { brain: unknown }).brain as {
      cybAttack: (s: ShipState, t: ShipState, tough: number, d: number, c: unknown) => void;
    }).cybAttack(cyb, player, 0, 1000, { firedAt: new Date() });

    expect(player.ltorpsChannel).not.toContain(7);
  });
});
