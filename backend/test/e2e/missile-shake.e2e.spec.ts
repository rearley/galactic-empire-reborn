/**
 * Missiles, end to end, between two missile-capable hulls.
 *
 * WHY THIS FILE EXISTS
 *
 * The missile shake-off fix could not be checked in play. Round 6 briefed a
 * pilot to provoke one and it was impossible: every AI class in the shipped
 * table is `S**MISL {Has Missile Capability? NO}` (MBMGESHP.MSG), and the
 * starter Interceptor is `hasMissile: false` too. Nothing in a normal session
 * can fire a missile at a new player, so the one fix nobody could confirm
 * stayed unconfirmed.
 *
 * The answer is to stage the engagement the game cannot: two class-2 Stealth
 * Fighters, real AppModule, real command handler, real physics and combat
 * ticks, real distances. No mocks.
 *
 * The regression being guarded is specific and was nasty. Shaking a missile
 * used to zero `lmisslDistance` alone. CombatTickService walks each slot by
 * CHANNEL, so a slot with its channel still set kept being processed:
 * `newDist = 0 - MISLSPED` went negative and the missile detonated at full
 * stored charge on the following tick. The player was told they had shaken it
 * off and was then killed by it. Freeing the whole slot is the fix, and the
 * assertion that matters is not that the fields are zero — it is that the tick
 * AFTER the shake does no damage.
 *
 * @see GEFUNCS.C:497-521 — the warp-boundary shake roll
 * @see GECMDS.C:1378-1395 — missile lock quality
 */

import 'reflect-metadata';
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { ShipChannelRegistry } from '../../src/game/ship/ship-channel.registry';
import { CombatTickService } from '../../src/game/combat/combat-tick.service';
import { PhysicsTickService } from '../../src/game/physics/physics-tick.service';
import { MissileHandlerService } from '../../src/game/commands/handlers/missile.handler';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult } from '../../src/game/commands/command.types';
import { NUMITEMS } from '../../src/game/constants';
import { I_MISSL } from '../../src/game/constants/items';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';

/** Class 2 Stealth Fighter — hasMissile: true, maxWarp 20. */
const MISSILE_CLASS = 2;

/**
 * Missile charge is an ENERGY value in 1..50000 (MISSILE_CHARGE_MAX), not a
 * percentage: `rollMissileHullDamage` normalises it against that ceiling, so a
 * charge of 99 is two thousandths of a warhead and correctly does nothing.
 * @see GEFUNCS.C:1641-1659
 */
const BIG_CHARGE = 30_000;

function makeShip(over: Partial<ShipState>): ShipState {
  return {
    userid: 'e2e', shipno: 1, shipname: 'E2E', shpclass: MISSILE_CLASS,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 500_000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: -1,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [255, 255, 255], ltorpsDistance: [0, 0, 0],
    lmisslChannel: [255, 255, 255], lmisslDistance: [0, 0, 0], lmisslEnergy: [0, 0, 0],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 20_000, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
  } as ShipState;
}

describe('missiles between two missile-capable ships (real services, no mocks)', () => {
  let app: INestApplication;
  let ships: ShipStateService;
  let channels: ShipChannelRegistry;
  let combat: CombatTickService;
  let physics: PhysicsTickService;
  let missile: MissileHandlerService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();

    // The test database carries no ShipClass rows, and `hasMissile` is read
    // from that table — with no row the handler answers "No missile launcher
    // mounted" for every hull. Seed the CANONICAL table (generated from
    // MBMGESHP.MSG by tools/extract-ship-classes.mjs) rather than hand-rolling
    // a class here, so this spec cannot drift from the shipped values, then
    // reload the cache that read the empty table at boot.
    const prisma = app.get(PrismaService);
    for (const c of SHIP_CLASSES) {
      await prisma.shipClass.upsert({
        where: { classNumber: c.classNumber },
        create: c as never,
        update: c as never,
      });
    }
    await app.get(ShipClassCacheService).onModuleInit();
    ships = app.get(ShipStateService);
    channels = app.get(ShipChannelRegistry);
    combat = app.get(CombatTickService);
    physics = app.get(PhysicsTickService);
    missile = app.get(MissileHandlerService);
  }, 30000);

  afterAll(async () => {
    await app?.close();
  }, 15000);

  const ctx = (seq: number) => ({
    kind: 'PHYSICS', firedAt: new Date('2026-09-04T12:00:00Z'), seq,
  });

  const combatTick = (seq = 1) =>
    (combat as unknown as { onPhysicsTick: (c: unknown) => void }).onPhysicsTick(ctx(seq));
  const physicsTick = (seq = 1) =>
    (physics as unknown as { advanceAll: (c: unknown) => void }).advanceAll(ctx(seq));

  /** Put a ship in the game with a real channel, the way the gateway does. */
  function enter(s: ShipState): ShipState {
    s.channel = channels.acquire(s.userid, s.shipno);
    ships.loadShip(s);
    return s;
  }

  /** Fire `mis <target> <charge>` through the real command handler. */
  function fire(from: ShipState, charge: number, targetName: string): string {
    if (from.channel === undefined) throw new Error('firer has no channel');
    const result = missile.command.handler(from, [targetName, String(charge)], {} as never) as CommandResult;
    return result.lines.map((l: { text: string }) => l.text).join(' | ');
  }

  /** A fresh, well-separated pair of missile-capable hulls. */
  let n = 0;
  function pair(): { firer: ShipState; target: ShipState } {
    n++;
    // The suite shrinks the galaxy to UNIVMAX=20 (test/helpers/test-galaxy-size.ts),
    // so stay well inside the wall — a ship that reaches it gets telezipped,
    // which zeroes speed and would silently defeat the acceleration below.
    const x = 4 + n, y = 3;
    const firer = enter(makeShip({
      userid: `e2e-mis-f${n}`, shipno: 1, shipname: `Firer${n}`,
      xcoord: x, ycoord: y,
      items: (() => { const it = new Array(NUMITEMS).fill(0n); it[I_MISSL] = 10n; return it; })(),
    }));
    const target = enter(makeShip({
      userid: `e2e-mis-t${n}`, shipno: 1, shipname: `Target${n}`,
      // 0.1 sectors apart — well inside the lock-quality gate.
      xcoord: x + 0.1, ycoord: y,
    }));
    return { firer, target };
  }

  it('a class-2 hull can actually launch a missile at another ship', () => {
    const { firer, target } = pair();

    const out = fire(firer, 50, target.shipname);

    expect(out).toContain('Missile away');
    // The slot lives on the TARGET, keyed by the firer's channel.
    expect(target.lmisslChannel[0]).toBe(firer.channel);
    expect(target.lmisslDistance[0]).toBeGreaterThan(0);
    expect(target.lmisslEnergy[0]).toBe(50);
    // Ammo actually left the rack.
    expect(firer.items[I_MISSL]).toBe(9n);
  });

  it('the starter Interceptor is refused — which is why round 6 could not test this', () => {
    const { firer, target } = pair();
    firer.shpclass = 1;

    expect(fire(firer, 50, target.shipname)).not.toContain('Missile away');
  });

  it('a missile that is NOT shaken runs in and damages the target', () => {
    const { firer, target } = pair();
    fire(firer, BIG_CHARGE, target.shipname);
    const launched = target.lmisslDistance[0];
    expect(launched).toBeGreaterThan(0);

    // Run it in. MISLSPED is the closing rate per physics tick.
    for (let t = 0; t < 20 && target.lmisslChannel[0] !== 255; t++) combatTick(t + 1);

    expect(target.damage).toBeGreaterThan(0);
  });

  it('crossing a warp boundary frees the WHOLE slot, and the missile never lands', () => {
    const { firer, target } = pair();
    fire(firer, BIG_CHARGE, target.shipname);
    expect(target.lmisslDistance[0]).toBeGreaterThan(0);

    const damageBefore = target.damage;

    // Accelerate across an integer warp boundary. The shake roll is
    // `4 + gernd()%4`, so 4..7 — arriving at warp 8 clears it on any roll.
    target.speed = 7_999;
    target.speed2b = 20_000;
    physicsTick();

    // The whole slot, not just the distance: a channel left set is still walked.
    expect(target.lmisslDistance[0]).toBe(0);
    expect(target.lmisslChannel[0]).toBe(255);
    expect(target.lmisslEnergy[0]).toBe(0);

    // The assertion that matters. With distance alone zeroed, the next tick
    // took `newDist = 0 - MISLSPED` negative and detonated at full charge.
    combatTick();
    expect(target.damage).toBe(damageBefore);
  });
});
