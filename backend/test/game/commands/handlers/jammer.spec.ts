import { EventEmitter2 } from '@nestjs/event-emitter';
import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { JammerHandlerService } from '../../../../src/game/commands/handlers/jammer.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState, shipKey } from '../../../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { JAMTIME } from '../../../../src/game/constants';
import { I_JAMMER } from '../../../../src/game/constants/items';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';
import {
  COMBAT_TARGET_WARNING,
  CombatTargetWarningEvent,
} from '../../../../src/game/combat/combat-events';

function itemsWith(map: Record<number, bigint>): bigint[] {
  const arr: bigint[] = [];
  for (let i = 0; i < 14; i++) arr.push(0n);
  for (const [k, v] of Object.entries(map)) arr[Number(k)] = v;
  return arr;
}

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    energy: 100000,
    items: itemsWith({ [I_JAMMER]: 3n }),
    topspeed: 10,
    ...over,
  });
}

function makeHarness(ships: ShipState[], scanRange = 10000, events?: EventEmitter2) {
  const shipMap = new Map<string, ShipState>();
  for (const s of ships) shipMap.set(shipKey(s.userid, s.shipno), s);
  const shipState = {
    findAllShips: () => Array.from(shipMap.values()),
    mutate: (userid: string, shipno: number, fn: (s: ShipState) => void) => {
      const s = shipMap.get(shipKey(userid, shipno));
      if (!s) return undefined;
      fn(s);
      s.dirty = true;
      return s;
    },
  } as unknown as ShipStateService;

  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange, maxTons: 5000,
  } as never);

  return new JammerHandlerService(shipState, cache, events ?? new EventEmitter2());
}

const ctx: CommandContext = {};

describe('JammerHandlerService — `jam`', () => {
  // Coordinates are sector-units (1 sector = 1.0); scanRange is raw units
  // (1 sector = 10_000). @see GECMDS.C:1636-1648 `ddist *= 10000`.
  it('happy path — applies jammer to all ships in scan range, including self', () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0 });
    const bob = makeShip({ userid: 'b', shipno: 2, xcoord: 0, ycoord: 0.5 });
    const handler = makeHarness([alice, bob], 10000);
    const result = handler.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JAM_FIRED));
    // bob is 0.5 sectors = 5000 raw units out of a 10000 range → JAMTIME * 0.5
    expect(bob.jammer).toBe(Math.floor(JAMTIME * 0.5));
    // alice (self, distance 0) → JAMTIME
    expect(alice.jammer).toBe(JAMTIME);
    expect(alice.items[I_JAMMER]).toBe(2n);
  });

  it('rejects when items[I_JAMMER] <= 0 (JAM_NOAMMO)', () => {
    const alice = makeShip({ items: itemsWith({ [I_JAMMER]: 0n }) });
    const handler = makeHarness([alice]);
    const result = handler.command.handler(alice, [], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JAM_NOAMMO));
  });

  it('distance scaling — ship at scanrange/2 gets floor(JAMTIME * 0.5); self gets JAMTIME', async () => {
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0 });
    const bob = makeShip({ userid: 'b', shipno: 2, xcoord: 0.5, ycoord: 0 });
    const carol = makeShip({ userid: 'c', shipno: 3, xcoord: 2, ycoord: 0 }); // outside
    const handler = makeHarness([alice, bob, carol], 10000);
    await handler.command.handler(alice, [], ctx);
    expect(alice.jammer).toBe(JAMTIME);
    expect(bob.jammer).toBe(Math.floor(JAMTIME * 0.5));
    expect(carol.jammer).toBe(0); // out of range
  });

  it('does not jam a ship on the far side of the galaxy', async () => {
    // scanRange 15_000 = 1.5 sectors. Bob is 10 sectors away.
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 2, ycoord: 3 });
    const bob = makeShip({ userid: 'b', shipno: 2, xcoord: 12, ycoord: 3 });
    const handler = makeHarness([alice, bob], 15000);
    await handler.command.handler(alice, [], ctx);
    expect(bob.jammer).toBe(0);
  });

  it('leaves an out-of-range ship\'s existing jammer counter alone', async () => {
    // C only writes wptr->jammer inside the in-range branch, so a jammer
    // already running on a distant ship must not be reset to 0.
    const alice = makeShip({ userid: 'a', shipno: 1, xcoord: 0, ycoord: 0 });
    const bob = makeShip({ userid: 'b', shipno: 2, xcoord: 9, ycoord: 0, jammer: 7 });
    const handler = makeHarness([alice, bob], 15000);
    await handler.command.handler(alice, [], ctx);
    expect(bob.jammer).toBe(7);
  });
});

/**
 * A jammed ship is TOLD its scanners have gone.
 *
 *   if (ingegame(zothusn) && ddist < shipclass[...].scanrange) {
 *       ...
 *       wptr->jammer = (unsigned)(((double)jamtime)*ddist);
 *       prfmsg(JAMMER3);
 *       outprfge(FILTER,zothusn);
 *   }
 *
 * @see GECMDS.C:1636-1650 jam()
 * @see GE/REL/MBMGEMSG.MSG:3890 JAMMER3 {***\nOur scanners are being jammed Sir!}
 *
 * The message goes to `zothusn` — each ship caught in the burst — not to the
 * firer. The port wrote the `jammer` counter and said nothing, so a victim's
 * scan simply went blank: contacts vanished with no cause given, which reads
 * as a bug rather than as an attack, and gives no cue to run or to `sys unjam`.
 *
 * Note the counter is written for every ship in range INCLUDING the firer
 * (canon's loop has no self-exclusion, and `jam()` is called on the firer's own
 * ship first) — so the firer is told too. That is canon's behaviour, not an
 * oversight to tidy up.
 */
describe('jam() warns each ship it blinds (GECMDS.C:1645)', () => {
  it('warns a ship inside the burst', () => {
    const firer = makeShip({ userid: 'u1', shipno: 1, items: itemsWith({ [I_JAMMER]: 3n }) });
    const victim = makeShip({ userid: 'u2', shipno: 1, xcoord: 0.1, ycoord: 0 });
    const events = new EventEmitter2();
    const seen: CombatTargetWarningEvent[] = [];
    events.on(COMBAT_TARGET_WARNING, (e: CombatTargetWarningEvent) => seen.push(e));
    const svc = makeHarness([firer, victim], 10_000, events);

    svc.command.handler(firer, [], {} as CommandContext) as CommandResult;

    expect(seen.filter((e) => e.kind === 'scanners-jammed').map((e) => e.victimId))
      .toContain('u2:1');
  });

  it('does not warn a ship outside scan range, which is also not jammed', () => {
    const firer = makeShip({ userid: 'u1', shipno: 1, items: itemsWith({ [I_JAMMER]: 3n }) });
    const distant = makeShip({ userid: 'u3', shipno: 1, xcoord: 500, ycoord: 500 });
    const events = new EventEmitter2();
    const seen: CombatTargetWarningEvent[] = [];
    events.on(COMBAT_TARGET_WARNING, (e: CombatTargetWarningEvent) => seen.push(e));
    const svc = makeHarness([firer, distant], 10_000, events);

    svc.command.handler(firer, [], {} as CommandContext) as CommandResult;

    expect(seen.map((e) => e.victimId)).not.toContain('u3:1');
    expect(distant.jammer).toBe(0);
  });

  it('warns nobody when the launch is refused for want of ammunition', () => {
    const firer = makeShip({ userid: 'u1', shipno: 1, items: itemsWith({ [I_JAMMER]: 0n }) });
    const victim = makeShip({ userid: 'u2', shipno: 1, xcoord: 0.1, ycoord: 0 });
    const events = new EventEmitter2();
    const seen: CombatTargetWarningEvent[] = [];
    events.on(COMBAT_TARGET_WARNING, (e: CombatTargetWarningEvent) => seen.push(e));
    const svc = makeHarness([firer, victim], 10_000, events);

    svc.command.handler(firer, [], {} as CommandContext) as CommandResult;

    expect(seen).toHaveLength(0);
  });

  it('carries no attacker letter — JAMMER3 takes no argument', () => {
    const firer = makeShip({ userid: 'u1', shipno: 1, items: itemsWith({ [I_JAMMER]: 3n }) });
    const victim = makeShip({ userid: 'u2', shipno: 1, xcoord: 0.1, ycoord: 0 });
    const events = new EventEmitter2();
    const seen: CombatTargetWarningEvent[] = [];
    events.on(COMBAT_TARGET_WARNING, (e: CombatTargetWarningEvent) => seen.push(e));
    const svc = makeHarness([firer, victim], 10_000, events);

    svc.command.handler(firer, [], {} as CommandContext) as CommandResult;

    expect(seen.find((e) => e.victimId === 'u2:1')?.attackerLetter).toBe('');
  });
});
