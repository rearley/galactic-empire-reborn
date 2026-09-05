/**
 * A ship that leaves the game takes its in-flight weapons with it.
 *
 * Canon's `warhupa` calls `cleartm(usrnum)` on every clean departure
 * (GEMAIN.C:1427), and `cleartm` walks EVERY other ship clearing any torpedo
 * or missile slot whose channel is the departing player's (GEFUNCS.C:1750-1775).
 * Projectile slots live on the VICTIM keyed by the FIRER's channel, so this is
 * how a logged-off pilot's ordnance stops existing.
 *
 * The port cleared `lastfired` here and nothing else, which left two holes:
 *
 *   1. Fire a volley, log off, and the torpedoes still run in and detonate.
 *   2. Worse — channels are RECYCLED (ShipChannelRegistry.acquire hands out the
 *      lowest free number). An orphaned slot still carrying channel 25 becomes
 *      the property of the next pilot to be given channel 25, so a newcomer who
 *      has never fired a shot gets credited with the kill.
 *
 * That second one is precisely the bug already fixed for `lastfired`, one
 * field over — the comment in `leave()` explains the reasoning and then only
 * applies it to `lastfired`.
 */
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { ShipChannelRegistry } from '../../../src/game/ship/ship-channel.registry';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../../src/game/constants';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u', shipno: 1, shipname: 'S', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0,
    ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  } as ShipState;
}

function build() {
  const channels = new ShipChannelRegistry();
  const svc = new ShipStateService(
    { ship: { update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }), delete: jest.fn().mockResolvedValue({}) }, shipClass: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService,
    { subscribe: jest.fn(() => jest.fn()) } as unknown as TickService,
    channels,
  );
  return { svc, channels };
}

/** Put a ship in the game the way the service does, returning its channel. */
function enter(svc: ShipStateService, _channels: ShipChannelRegistry, s: ShipState): number {
  svc.loadShip(s);
  return s.channel as number;
}

describe('cleartm — a departing ship takes its ordnance with it', () => {
  it('clears torpedoes it fired from every other ship', async () => {
    const { svc, channels } = build();
    const firer = makeShip({ userid: 'firer', shipno: 1 });
    const victim = makeShip({ userid: 'victim', shipno: 1 });
    const firerCh = enter(svc, channels, firer);
    enter(svc, channels, victim);

    // A torpedo in flight: the slot lives on the VICTIM, keyed by firer channel.
    victim.ltorpsChannel[0] = firerCh;
    victim.ltorpsDistance[0] = 5000;

    await svc.unboard(firer.userid, firer.shipno);

    expect(victim.ltorpsChannel[0]).toBe(255);
    expect(victim.ltorpsDistance[0]).toBe(0);
  });

  it('clears its missiles too, energy included', async () => {
    const { svc, channels } = build();
    const firer = makeShip({ userid: 'firer', shipno: 1 });
    const victim = makeShip({ userid: 'victim', shipno: 1 });
    const firerCh = enter(svc, channels, firer);
    enter(svc, channels, victim);

    victim.lmisslChannel[0] = firerCh;
    victim.lmisslDistance[0] = 5000;
    victim.lmisslEnergy[0] = 30_000;

    await svc.unboard(firer.userid, firer.shipno);

    expect(victim.lmisslChannel[0]).toBe(255);
    expect(victim.lmisslDistance[0]).toBe(0);
    expect(victim.lmisslEnergy[0]).toBe(0);
  });

  it('does not hand an orphaned torpedo to the next pilot given that channel', async () => {
    const { svc, channels } = build();
    const quitter = makeShip({ userid: 'quitter', shipno: 1 });
    const victim = makeShip({ userid: 'victim', shipno: 1 });
    const quitterCh = enter(svc, channels, quitter);
    enter(svc, channels, victim);

    victim.ltorpsChannel[0] = quitterCh;
    victim.ltorpsDistance[0] = 5000;

    await svc.unboard(quitter.userid, quitter.shipno);

    // A newcomer is handed the recycled channel.
    const newcomer = makeShip({ userid: 'newcomer', shipno: 1 });
    const newCh = enter(svc, channels, newcomer);
    expect(newCh).toBe(quitterCh); // the registry really does recycle

    // The newcomer must not own a torpedo they never fired.
    expect(victim.ltorpsChannel[0]).not.toBe(newCh);
  });

  it('leaves torpedoes fired by OTHER ships alone', async () => {
    const { svc, channels } = build();
    const leaver = makeShip({ userid: 'leaver', shipno: 1 });
    const other = makeShip({ userid: 'other', shipno: 1 });
    const victim = makeShip({ userid: 'victim', shipno: 1 });
    enter(svc, channels, leaver);
    const otherCh = enter(svc, channels, other);
    enter(svc, channels, victim);

    victim.ltorpsChannel[1] = otherCh;
    victim.ltorpsDistance[1] = 4000;

    await svc.unboard(leaver.userid, leaver.shipno);

    expect(victim.ltorpsChannel[1]).toBe(otherCh);
    expect(victim.ltorpsDistance[1]).toBe(4000);
  });
});
