/**
 * Pilots who shoot back, so Cybertrons die and the galaxy has to replace them.
 *
 * The property under test is the v0.29.0 respawn schedule: a class is held
 * empty after a death for `respawnDelayMs(canon tot_to_create)`, and refilled
 * by the spawn slot once the hold lifts. PORT-ORIGINAL, @see
 * docs/DECISIONS.md 2026-09-20 "Cybertron rarity is re-expressed as respawn time".
 * The per-second invariants run throughout. @see issue #61
 */
vi.hoisted(() => { process.env.UNIVMAX = '100'; });

import { GalaxySim, fightBack } from './galaxy-sim';
import { createInvariantChecker, describeViolation } from './sim-invariants';
import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';
import { isPlayerBuyableClass } from '../../src/game/ship/buyable-class';
import { CANON_TOT_TO_CREATE, respawnDelayMs } from '../../src/game/cybertron/cyb-population';
import { buildCybertronClassConfigs } from '../../src/game/cybertron/cybertron.config';

const SEEDS = [1, 2, 3] as const;
const RUN_SECONDS = 4 * 3600;
/** One spawn slot: every 30 PHYSICS ticks of 6 s. @see CybertronTickService.onPhysicsTick */
const SPAWN_SLOT_SECONDS = 30 * 6;
const PILOT_RESPAWN_SECONDS = 60;

/** The hull a pilot expecting a fight would buy: most phaser, then most shield. */
const HEAVIEST = [...SHIP_CLASSES]
  .filter((c) => isPlayerBuyableClass(c))
  .sort((a, b) => b.maxPhaser - a.maxPhaser || b.maxShields - a.maxShields)[0];

const START_POINTS = [
  { name: 'Ace', at: { x: 10.5, y: 10.5 } },
  { name: 'Brick', at: { x: -20.5, y: 30.5 } },
  { name: 'Cobalt', at: { x: 40.5, y: -15.5 } },
];

interface Kill { at: number; classNumber: number }
interface Spawn { at: number; classNumber: number }

let current: GalaxySim | undefined;
afterEach(() => {
  current?.dispose();
  current = undefined;
  vi.useRealTimers();
});

describe.each(SEEDS)('seed %i', (seed) => {
  it('kills are replaced on the v0.29.0 schedule: never early, and no spawn slot wasted', async () => {
    GalaxySim.installClock();
    const sim = await GalaxySim.create({ seed });
    current = sim;
    const checker = createInvariantChecker(sim);
    const deadSince = new Map<string, number>();
    const spawn = (p: (typeof START_POINTS)[number]): void => {
      sim.addPilot({ name: p.name, classNumber: HEAVIEST.classNumber, at: p.at, shields: true, script: fightBack() });
    };
    START_POINTS.forEach(spawn);

    // The spawn slot fires on every 30th PHYSICS tick. Record which classes
    // were short and past their hold the second before, and whether the slot
    // spawned anything. Holds are derived from the kills, with a second's
    // margin either side so a boundary is never counted against the slot.
    const caps = buildCybertronClassConfigs();
    const lastKill = new Map<number, number>();
    const slots = { used: 0, wasted: 0, log: [] as string[] };
    let readyBefore: number[] = [];
    let cursor = 0;

    await sim.run({
      seconds: RUN_SECONDS,
      every: () => {
        checker.check();
        let spawned = false;
        for (; cursor < sim.events.length; cursor++) {
          const e = sim.events[cursor];
          if (e.name === 'cybertron.spawned') spawned = true;
          if (e.name !== 'combat.ship-destroyed') continue;
          const v = e.payload as { victimUserid?: string; victimClass?: number };
          if (v.victimUserid?.startsWith('Cybrg-') && typeof v.victimClass === 'number') lastKill.set(v.victimClass, sim.elapsed);
        }
        if (sim.elapsed % SPAWN_SLOT_SECONDS === 0) {
          if (spawned) slots.used++;
          else if (readyBefore.length > 0) {
            slots.wasted++;
            slots.log.push(`t=${sim.elapsed}s nothing spawned; ready: ${readyBefore.join(', ')}`);
          }
        }
        const counts = new Map<number, number>();
        for (const c of sim.cybertrons()) counts.set(c.shpclass, (counts.get(c.shpclass) ?? 0) + 1);
        readyBefore = Object.entries(caps)
          .map(([k, v]) => ({ n: Number(k), cap: v.tot_to_create }))
          .filter(({ n, cap }) => (counts.get(n) ?? 0) < cap)
          .filter(({ n }) => {
            const k = lastKill.get(n);
            return k === undefined || sim.elapsed + 1 > k + respawnDelayMs(CANON_TOT_TO_CREATE[n] ?? 0) / 1000 + 1;
          })
          .map(({ n }) => n);
        for (const p of START_POINTS) {
          const alive = sim.pilots().some((s) => s.shipname === p.name);
          if (alive) { deadSince.delete(p.name); continue; }
          const since = deadSince.get(p.name) ?? sim.elapsed;
          deadSince.set(p.name, since);
          if (sim.elapsed - since >= PILOT_RESPAWN_SECONDS) spawn(p);
        }
      },
    });

    expect(checker.violations.map(describeViolation).join('\n\n')).toBe('');

    const kills: Kill[] = sim.events
      .filter((e) => e.name === 'combat.ship-destroyed')
      .map((e) => ({ at: e.at, p: e.payload as { victimUserid?: string; victimClass?: number } }))
      .filter((k) => k.p.victimUserid?.startsWith('Cybrg-') && typeof k.p.victimClass === 'number')
      .map((k) => ({ at: k.at, classNumber: k.p.victimClass! }));
    const spawns: Spawn[] = sim.events
      .filter((e) => e.name === 'cybertron.spawned' && e.at > 0)
      .map((e) => ({ at: e.at, classNumber: (e.payload as { classNumber: number }).classNumber }));

    expect(kills.length).toBeGreaterThan(0);

    // Never early: no killed class returns inside its hold.
    const early: string[] = [];
    for (const k of kills) {
      const holdS = respawnDelayMs(CANON_TOT_TO_CREATE[k.classNumber] ?? 0) / 1000;
      const next = spawns.find((s) => s.classNumber === k.classNumber && s.at > k.at);
      if (next && next.at < k.at + holdS) early.push(`class ${k.classNumber} killed t=${k.at}s, back t=${next.at}s, hold ${holdS}s`);
    }
    expect(early).toEqual([]);

    // No slot wasted while a class is ready: short, and past its hold. Only
    // canon's 1% any-class pick may still land on a class that cannot spawn.
    expect(slots.used + slots.wasted).toBeGreaterThan(0);
    expect(slots.wasted, slots.log.join('\n')).toBeLessThanOrEqual(Math.ceil(0.03 * (slots.used + slots.wasted)));
  });
});
