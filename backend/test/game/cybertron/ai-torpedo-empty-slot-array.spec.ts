/**
 * An AI torpedo launches at a ship whose `ltorps` arrays are EMPTY.
 *
 * Canon has no arrays to grow: `ltorps` is a fixed `MISSILE ltorps[MAXTORPS]`
 * inside WARSHP (GEMAIN.H), so `torp()` walks a literal three slots and always
 * finds one free on a ship nothing is chasing:
 *
 *   for (i=0;i<MAXTORPS;++i)
 *       if (wptr->ltorps[i].channel == 255) break;
 *   -- GECMDS.C:1178-1181
 *
 * Our port stores them as Postgres `Int[]`, which defaults to `[]`, and the
 * two AI launch paths looked for the free slot with
 *
 *   ltorpsChannel.findIndex((ch) => ch === 255 || ch === undefined)
 *
 * `findIndex` over an empty array is -1 — the same value the code reads as
 * "all three tubes are already tracking" — so every AI torpedo aimed at a
 * fresh ship was discarded before it existed. The taunt had already printed
 * by then, which is what made it look like an AI that trash-talks and never
 * shoots. The player path (torpedo.handler.ts) loops `i < MAXTORPS` and was
 * never affected, so the arrays only ever grew when a HUMAN torpedoed you;
 * on a single-player world they stayed `[]` permanently.
 *
 * Reported from play: "see how I never get attacked by the scout", after a
 * full Cybertron Scout engagement in which the Scout hailed with
 * "Suck on this torpedo you Gloxanian Slugworm!" (M14 — the ATTACK band, so
 * `cyb_attack` had definitely run) and never landed one.
 *
 * The sibling spec `ai-torpedo-warns-target.spec.ts` passes only because its
 * fixture pre-pads `ltorpsChannel: [255,255,255]` — a shape the DB never hands
 * out. Fixtures here start empty on purpose.
 */

import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';
import { CybertronRepository } from '../../../src/game/cybertron/cybertron.repository';
import { DroidTickService } from '../../../src/game/droid/droid-tick.service';
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
    // ltorpsChannel/ltorpsDistance/lmisslChannel/lmisslDistance/lmisslEnergy
    // are left at the factory's empty-array default deliberately: that's the
    // shape Prisma actually hands back for a ship nothing has ever fired at.
    items: Array.from({ length: NUMITEMS }, () => 0n),
    cybmine: 255,
    cybskill: 5,
    topspeed: 8,
    userKills: 6,
    ...over,
  });
}

function shipStateFor(ships: ShipState[]) {
  return {
    findAllShips: () => ships,
    findByUserid: () => [],
    get: () => undefined,
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = ships.find((x) => x.userid === userid && x.shipno === shipno);
      if (s) fn(s);
    },
    loadShip: () => {}, removeFromGame: () => {}, size: () => ships.length,
  } as unknown as ShipStateService;
}

const classCache = {
  get: () => ({ hasTorpedo: true, hasZipper: false, scanRange: 50_000, maxTons: 900 }),
  getMaxTons: () => 900,
  getTypeName: () => 'Cybertron Scout',
} as unknown as ShipClassCacheService;

/** Draw 1 (phaser roll) fails; draw 2 (torp roll) succeeds; draw 3 -> 1 torp. */
const scriptedRandom = (): Random =>
  ({ next: (() => { const v = [0.5, 0.1, 0.9]; let i = 0; return () => (i < v.length ? v[i++] : 0.999); })() } as Random);

describe('AI torpedoes reach a target whose ltorps arrays are empty (GECMDS.C:1178)', () => {
  it('a Cybertron queues a torpedo into slot 0 of an untouched target', () => {
    const cyb = makeShip({
      userid: 'Cybrg-7', shipno: 7, shpclass: 21, status: 2, channel: 7,
    } as Partial<ShipState>);
    cyb.items = [...cyb.items];
    cyb.items[I_TORP] = 5n;
    const player = makeShip({ userid: 'p1', shipno: 1, xcoord: 5.1, ycoord: 5 });

    const svc = new CybertronTickService(
      { subscribe: () => () => {} } as unknown as TickService,
      shipStateFor([cyb, player]),
      classCache,
      {
        hydrateAll: vi.fn().mockResolvedValue(undefined),
        clampCybertronCash: (n: bigint) => n,
      } as unknown as CybertronRepository,
      new EventEmitter2(),
      scriptedRandom(),
    );

    ((svc as unknown as { brain: unknown }).brain as {
      cybAttack: (s: ShipState, t: ShipState, tough: number, d: number, c: unknown) => void;
    }).cybAttack(cyb, player, 0, 1000, { firedAt: new Date() });

    expect(player.ltorpsChannel[0]).toBe(7);
    expect(player.ltorpsDistance[0]).toBe(1000);
  });
});
