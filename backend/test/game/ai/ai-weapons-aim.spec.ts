/**
 * An AI's phasers go where it points them, whatever its heading.
 *
 * `selectPhaserVictims` and `selectHyperVictims` take the firing degree
 * RELATIVE to the hull: `withinArc` adds the firer's heading itself
 * (`firingAngle = firer.heading + degree`), which is canon's
 * `normal(ptr->heading + (double)ptr->degrees)` (GECMDS.C:1035). The player's
 * `pha` passes the degree the pilot typed, relative, and has always been right.
 *
 * The AI passed an ABSOLUTE bearing — `heading + degrees` — so the heading was
 * added twice and the beam went out at twice the hull's heading. Every AI test
 * harness sat at heading 0, where the two agree, so nothing caught it; in play a
 * Cybertron's pursuit band turns it toward its prey, and at almost any heading
 * its phasers missed. Found while moving the Droids onto the same weapons (#62).
 * @see docs/DECISIONS.md 2026-09-21
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AiWeapons } from '../../../src/game/ai/ai-weapons';
import { COMBAT_HIT } from '../../../src/game/combat/combat-events';
import type { ShipState } from '../../../src/game/ship/ship-state.types';
import type { ShipStateService } from '../../../src/game/ship/ship-state.service';
import type { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { GESTAT_AUTO, HPMINFIR } from '../../../src/game/constants';
import { makeShip } from '../../helpers/make-ship';

const CTX = { kind: 'PHYSICS', tickNumber: 1, firedAt: new Date(0) } as never;

function rig(heading: number, at: { x: number; y: number }, where = 0) {
  const ai = makeShip({
    userid: 'Cybrg-205', shipno: 205, status: GESTAT_AUTO, channel: 9, xcoord: 5, ycoord: 5,
    heading, phasr: 100, phasrtype: 2, percent: 2, where, energy: HPMINFIR,
  });
  const target = makeShip({ userid: 'p1', shipno: 1, status: 1, channel: 1, xcoord: at.x, ycoord: at.y, where, shieldstat: 0 });
  const map = new Map([ai, target].map((s) => [`${s.userid}:${s.shipno}`, s]));
  const events = new EventEmitter2();
  const hits: string[] = [];
  events.on(COMBAT_HIT, (e: { victimId: string }) => hits.push(e.victimId));
  const weapons = new AiWeapons({
    shipState: {
      findAllShips: () => Array.from(map.values()),
      mutate: (u: string, n: number, fn: (s: ShipState) => void) => { const s = map.get(`${u}:${n}`); if (s) fn(s); return s; },
    } as unknown as ShipStateService,
    classes: { get: () => ({ scanRange: 100_000 }), getMaxTons: () => 100 } as unknown as ShipClassCacheService,
    events,
    random: { next: () => 0.99 },
    logger: { error: vi.fn() } as never,
  });
  return { ai, target, weapons, hits };
}

describe.each([0, 45, 90, 200, 315])('an AI at heading %i', (heading) => {
  it('hits a target it aims at with firep', () => {
    // A target 0.1 sectors away at an absolute bearing of 30 degrees.
    const rad = (30 * Math.PI) / 180;
    const { ai, target, weapons, hits } = rig(heading, { x: 5 + 0.1 * Math.sin(rad), y: 5 - 0.1 * Math.cos(rad) });
    weapons.firep(ai, target, CTX);
    expect(hits).toEqual(['p1:1']);
  });

  it('hits a target it aims at with firehp', () => {
    const rad = (30 * Math.PI) / 180;
    const { ai, target, weapons, hits } = rig(heading, { x: 5 + 0.1 * Math.sin(rad), y: 5 - 0.1 * Math.cos(rad) }, 1);
    weapons.firehp(ai, target, CTX);
    expect(hits).toEqual(['p1:1']);
  });

  it('fires down its nose when told not to aim, and so hits what is dead ahead', () => {
    const rad = (heading * Math.PI) / 180;
    const { ai, target, weapons, hits } = rig(heading, { x: 5 + 0.1 * Math.sin(rad), y: 5 - 0.1 * Math.cos(rad) });
    ai.degrees = 0;
    weapons.firep(ai, target, CTX, { aimAtTarget: false });
    expect(hits).toEqual(['p1:1']);
  });
});
