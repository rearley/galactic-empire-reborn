/**
 * Jumping to hyperspace sheds every torpedo tracking you. Missiles follow.
 *
 * Canon does this on hyperspace ENTRY, not in the flight loop:
 *
 *   ptr->where = 1;
 *   for(i=0;i<MAXTORPS;++i)  ptr->ltorps[i].distance = 0;
 *   for(i=0;i<MAXDECOY;++i)  ptr->decout[i] = 0;
 *   -- GEFUNCS.C:603-612 hyperspace(ptr, usrn, 1)
 *
 * `lmissl` is deliberately absent from that list, and `hel battle` says why:
 * "you can ditch them easily by making a jump to light speed... This does not
 * work for missiles though as they too can go hyperspace."
 *
 * The port cleared `ltorpsDistance` and left `ltorpsChannel` set. That matters
 * because canon's flight loop tests the DISTANCE for liveness
 * (`if (tptr->distance > 1)`, GEFUNCS.C:1548) while ours tests the CHANNEL. So
 * a slot with channel set and distance 0 read as a live torpedo that had
 * already arrived:
 *
 *     newDist = 0 - TORPSPED   ->  negative
 *     if (newDist > 0) ...     ->  false, falls through to resolveProjectileHit
 *
 * Canon's CANCEL became DETONATE-NOW. The escape manoeuvre was firing the
 * torpedoes into you. Reported from play — a pilot jumped with two tracking and
 * took both hits on the next tick, having also just been refused a decoy
 * because decoys are blocked in hyperspace (GECMDS.C:1552).
 *
 * Clearing the channel is also what frees the slot: `findFreeTorpSlot` looks
 * for 255, so a distance-only clear would strand the tube permanently once the
 * phantom hit stopped clearing it.
 */

import { applyHyperspaceTransition } from '../../../src/game/physics/hyperspace';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { MAXTORPS, MAXMISSL } from '../../../src/game/constants';
import { findFreeTorpSlot } from '../../../src/game/combat/projectile-slots';
import { NUMITEMS } from '../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'p1',
    shipname: 'QuiteCat',
    shpclass: 2,
    xcoord: 5,
    ycoord: 5,
    energy: 50_000,
    phasr: 100,
    phasrtype: 5,
    shieldtype: 4,
    items: Array.from({ length: NUMITEMS }, () => 0n),
    topspeed: 20,
    ...over,
  });
}

/** Two torpedoes closing, one decoy out, one missile inbound. */
const underAttack = () => makeShip({
  ltorpsChannel: [7, 7, 255],
  ltorpsDistance: [12_000, 4_000, 0],
  lmisslChannel: [9, 255, 255],
  lmisslDistance: [30_000, 0, 0],
  lmisslEnergy: [50_000, 0, 0],
  decout: [5, 0, 0, 0, 0],
});

describe('hyperspace entry sheds torpedoes (GEFUNCS.C:603-612)', () => {
  it('frees every torpedo tube — channel as well as distance', () => {
    const ship = underAttack();

    applyHyperspaceTransition(ship, 'enter');

    for (let i = 0; i < MAXTORPS; i++) {
      expect(ship.ltorpsDistance[i]).toBe(0);
      // The channel is what our flight loop reads for liveness. Leaving it set
      // is what turned the cancel into an immediate detonation.
      expect(ship.ltorpsChannel[i]).toBe(255);
    }
    // And the tube is genuinely reusable, not stranded as "occupied".
    expect(findFreeTorpSlot(ship.ltorpsChannel)).toBe(0);
  });

  it('leaves MISSILES tracking — they can go hyperspace too', () => {
    const ship = underAttack();

    applyHyperspaceTransition(ship, 'enter');

    expect(ship.lmisslChannel[0]).toBe(9);
    expect(ship.lmisslDistance[0]).toBe(30_000);
    expect(ship.lmisslChannel.slice(0, MAXMISSL)).not.toEqual([255, 255, 255]);
  });

  it('still clears the decoys you had out', () => {
    const ship = underAttack();

    applyHyperspaceTransition(ship, 'enter');

    expect(ship.decout.every((d) => d === 0)).toBe(true);
  });

  it('leaving hyperspace sheds nothing — the clear is on ENTRY only', () => {
    const ship = underAttack();
    ship.where = 1;

    applyHyperspaceTransition(ship, 'exit');

    expect(ship.ltorpsChannel[0]).toBe(7);
    expect(ship.ltorpsDistance[0]).toBe(12_000);
    expect(ship.decout[0]).toBe(5);
  });
});
