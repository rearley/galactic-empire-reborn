/**
 * A restart must not re-fire a volley that was already in the air.
 *
 * `ltorps*` and `lmissl*` are persisted COLUMNS, so a ship carrying inbound
 * projectiles when the server stopped hydrates with them still inbound — and
 * `checktm` resolves them on the first physics tick. The victim is hit a second
 * time by shots that already landed, and if the volley was lethal it dies on
 * EVERY boot, because the consumed projectiles are never flushed back:
 *
 *   1. boot — hydrate with three missiles inbound
 *   2. tick 1 — all three land, the ship dies
 *   3. removed from memory; the row keeps distance and damage as they were
 *   4. next boot — same row, same volley, forever
 *
 * Production, `Cybrg-216`, across three restarts with a byte-identical
 * manifest each time — `lmisslDistance {1070,1070,1070}` at
 * `lmisslEnergy {50000,50000,50000}`, fired by a channel that no longer exists.
 * Four more Cybertrons were carrying live volleys when this was found.
 *
 * **Canon never had this case** — a MajorBBS module did not restart mid-flight —
 * but it settles the principle. `cleartm` walks every ship in the game and
 * blanks the tubes belonging to a channel that has left, keyed on the channel
 * rather than the distance: GEFUNCS.C:1766 `wptr->ltorps[j].channel = 255;`.
 * A restart is that same event for every channel at once, so disarming on
 * hydration is cleartm's own rule applied to the one case it never had to name.
 * @see docs/DECISIONS.md 2026-09-17
 *
 * The clearing lives in `prismaShipToState` rather than in boot hydration alone
 * because every path that reads a hull off disk has the same problem — the
 * gateway re-boards a cold ship through the same mapper
 * (`connection-lifecycle.service.ts:468`), and a player's own hull re-armed
 * with a stale volley is the same defect wearing a different hat.
 *
 * @see https://github.com/rearley/galactic-empire-reborn/issues/53
 */
import { prismaShipToState } from '../../../src/game/ship/ship-state.mappers';
import type { Ship } from '../../../src/prisma/client';

/** The production row for `Cybrg-216`, as it stood on 2026-09-17. */
function rowWithVolley(over: Partial<Ship> = {}): Ship {
  return {
    userid: 'Cybrg-216',
    shipno: 216,
    shipname: 'SADx346686',
    shpclass: 24,
    heading: 0,
    head2b: 0,
    speed: 2157,
    speed2b: 2157,
    xcoord: 2.79,
    ycoord: 1.02,
    damage: 0,
    energy: 65000,
    phasr: 100,
    phasrtype: 1,
    kills: 0,
    lastfired: 14,
    shieldtype: 1,
    shieldstat: 0,
    shield: 0,
    cloak: 0,
    degrees: 0,
    percent: 0,
    tactical: 0,
    helm: 0,
    train: 0,
    where: 1,
    ltorpsChannel: [14, 14, 14],
    ltorpsDistance: [4404, 4404, 4251],
    lmisslChannel: [14, 14, 14],
    lmisslDistance: [1070, 1070, 1070],
    lmisslEnergy: [50000, 50000, 50000],
    decout: [],
    jammer: 0,
    freq: [],
    items: new Array(14).fill(0n) as bigint[],
    titem: 0,
    hostile: 0,
    cantexit: 6,
    repair: 0,
    hypha: 0,
    firecntl: 0,
    destruct: 0,
    status: 2,
    cybmine: 255,
    cybskill: 10,
    cybupdate: 100,
    tick: 6,
    emulate: 0,
    minesnear: 0,
    lock: 0,
    holdcourse: 0,
    topspeed: 8,
    warncntr: 0,
    ...over,
  } as unknown as Ship;
}

describe('hydrating a hull disarms whatever was in the air', () => {
  it('clears inbound missiles — distance, channel and charge together', () => {
    const s = prismaShipToState(rowWithVolley());
    expect(s.lmisslDistance).toEqual([0, 0, 0]);
    expect(s.lmisslChannel).toEqual([255, 255, 255]);
    // The charge matters as much as the distance: `checktm` reads
    // `mptr->energy` for the damage, so a live charge on a zeroed distance
    // would be a missile waiting for the next thing to set a distance.
    expect(s.lmisslEnergy).toEqual([0, 0, 0]);
  });

  it('clears inbound torpedoes', () => {
    const s = prismaShipToState(rowWithVolley());
    expect(s.ltorpsDistance).toEqual([0, 0, 0]);
    expect(s.ltorpsChannel).toEqual([255, 255, 255]);
  });

  it('leaves everything else on the row alone', () => {
    // The narrow claim. This is a targeted disarm, not a general sanitiser —
    // position, flight state and cargo are the ship and must survive a restart.
    const s = prismaShipToState(rowWithVolley());
    expect(s.xcoord).toBe(2.79);
    expect(s.ycoord).toBe(1.02);
    expect(s.speed).toBe(2157);
    expect(s.where).toBe(1);
    expect(s.damage).toBe(0);
    expect(s.cantexit).toBe(6);
    expect(s.lastfired).toBe(14);
  });

  it('is shaped the same for a hull that had nothing inbound', () => {
    // No special case for the empty path: an untouched ship and a disarmed one
    // hydrate identically, so nothing downstream can tell which it was.
    const quiet = prismaShipToState(rowWithVolley({
      ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
      lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0],
      lmisslEnergy: [0, 0, 0],
    } as Partial<Ship>));
    const disarmed = prismaShipToState(rowWithVolley());
    expect(disarmed.ltorpsDistance).toEqual(quiet.ltorpsDistance);
    expect(disarmed.lmisslDistance).toEqual(quiet.lmisslDistance);
    expect(disarmed.lmisslEnergy).toEqual(quiet.lmisslEnergy);
  });

  it('normalises a short or empty array to three empty tubes', () => {
    // Production carries rows with `{}` and `{0,0}` in these columns. MAXTORPS
    // and MAXMISSL are 3 (GEMAIN.H:125 `#define MAXTORPS 3`), and the tick
    // walks fixed slots, so a short array is a hull with tubes that do not
    // exist rather than a hull with fewer of them.
    const s = prismaShipToState(rowWithVolley({
      ltorpsChannel: [], ltorpsDistance: [],
      lmisslChannel: [0, 0], lmisslDistance: [0, 0], lmisslEnergy: [0, 0],
    } as Partial<Ship>));
    expect(s.ltorpsDistance).toHaveLength(3);
    expect(s.lmisslDistance).toHaveLength(3);
    expect(s.lmisslEnergy).toEqual([0, 0, 0]);
    expect(s.ltorpsChannel).toEqual([255, 255, 255]);
  });
});
