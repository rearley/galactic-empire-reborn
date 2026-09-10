/**
 * Handlers fire in canon's order, not in whatever order Nest built them.
 *
 * `warrtia` is one function with a fixed sequence (GEMAIN.C:2256-2267):
 * fluxstat, repairship, shieldstat, cloakstat, checktm, fireion, recharge,
 * checkdam. The order is load-bearing — `fluxstat` runs first so a ship about
 * to starve reloads BEFORE anything tests its energy.
 *
 * The port split that function across services and registered them through a
 * Set, so the sequence was an emergent property of the DI graph. It came out
 * backwards for flux and cloak, and a player found it: cloak plus Mark-7
 * shields drained a full tank to zero in eight ticks, the cloak was tested
 * first and shut down, and only then did the pod load. His ship was left at
 * 64,301 energy with fifteen pods and no cloak — the exact figure that
 * sequence predicts.
 */
import { TickService } from '../../../src/game/tick/tick.service';
import { TickKind } from '../../../src/game/tick/tick.types';
import { TickOrder } from '../../../src/game/tick/tick-order';
import { InvariantRegistry } from '../../../src/game/invariants/harness';

function makeService(): TickService {
  return new TickService({ runAll: () => [] } as unknown as InvariantRegistry);
}

describe('TickService handler ordering', () => {
  it('fires handlers in ascending order regardless of subscription order', () => {
    const svc = makeService();
    const seen: string[] = [];
    // Deliberately registered backwards.
    svc.subscribe(TickKind.PHYSICS, () => { seen.push('cloak'); }, TickOrder.CLOAK);
    svc.subscribe(TickKind.PHYSICS, () => { seen.push('flux'); }, TickOrder.FLUX);
    (svc as unknown as { fire: (k: TickKind) => void }).fire(TickKind.PHYSICS);
    expect(seen).toEqual(['flux', 'cloak']);
  });

  it('keeps registration order among handlers that share an order', () => {
    const svc = makeService();
    const seen: string[] = [];
    svc.subscribe(TickKind.PHYSICS, () => { seen.push('a'); }, TickOrder.DEFAULT);
    svc.subscribe(TickKind.PHYSICS, () => { seen.push('b'); }, TickOrder.DEFAULT);
    (svc as unknown as { fire: (k: TickKind) => void }).fire(TickKind.PHYSICS);
    expect(seen).toEqual(['a', 'b']);
  });

  it('defaults an unordered handler to the back, so old callers do not jump the queue', () => {
    const svc = makeService();
    const seen: string[] = [];
    svc.subscribe(TickKind.PHYSICS, () => { seen.push('unordered'); });
    svc.subscribe(TickKind.PHYSICS, () => { seen.push('flux'); }, TickOrder.FLUX);
    (svc as unknown as { fire: (k: TickKind) => void }).fire(TickKind.PHYSICS);
    expect(seen).toEqual(['flux', 'unordered']);
  });

  it('unsubscribe still removes the handler', () => {
    const svc = makeService();
    const seen: string[] = [];
    const off = svc.subscribe(TickKind.PHYSICS, () => { seen.push('x'); }, TickOrder.FLUX);
    off();
    (svc as unknown as { fire: (k: TickKind) => void }).fire(TickKind.PHYSICS);
    expect(seen).toEqual([]);
  });

  it('flux is ordered before cloak, which is the whole point', () => {
    expect(TickOrder.FLUX).toBeLessThan(TickOrder.CLOAK);
  });
});
