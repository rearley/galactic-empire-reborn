/**
 * The REAL services register at the positions canon gives them.
 *
 * `flux-rescues-cloak.integration.spec.ts` proves that whatever holds
 * TickOrder.FLUX runs before the cloak upkeep. It registers a stub at that
 * position, so it cannot prove the real restorative pass is what sits there —
 * and a service quietly reverting to an unordered subscribe would leave that
 * test green while the game went back to killing cloaks at zero power.
 *
 * That is exactly the gap that hid the original defect: a correct helper, a
 * handler that could not reach it, each fine on its own. This asserts the
 * wiring itself.
 *
 * @see GEMAIN.C:2256-2259 fluxstat ... cloakstat
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TickKind } from '../../../src/game/tick/tick.types';
import { TickOrder } from '../../../src/game/tick/tick-order';
import { TickService } from '../../../src/game/tick/tick.service';
import { ShipTickService } from '../../../src/game/ship/ship-tick.service';
import { ShipManagementTickService } from '../../../src/game/commands/ship-management-tick.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';

type Reg = { kind: TickKind; order: number | undefined };

/** A TickService that records what was registered rather than running it. */
function recorder(): { tick: TickService; regs: Reg[] } {
  const regs: Reg[] = [];
  const tick = {
    subscribe: (kind: TickKind, _h: unknown, order?: number) => {
      regs.push({ kind, order });
      return () => {};
    },
    registerSnapshotProvider: () => () => {},
  } as unknown as TickService;
  return { tick, regs };
}

const shipState = {
  findAllShips: () => [],
  mutate: () => undefined,
} as unknown as ShipStateService;

describe('warrtia ordering is wired to the real services', () => {
  it('ShipTickService puts its restorative pass at the FLUX position', () => {
    const { tick, regs } = recorder();
    const svc = new ShipTickService(
      tick, shipState, undefined as never, undefined, new EventEmitter2(),
    );
    svc.onModuleInit();

    const physics = regs.filter((r) => r.kind === TickKind.PHYSICS);
    expect(physics.length).toBeGreaterThan(0);
    expect(physics.map((r) => r.order)).toContain(TickOrder.FLUX);
  });

  it('ShipManagementTickService puts its cloak upkeep at the CLOAK position', () => {
    const { tick, regs } = recorder();
    const svc = new ShipManagementTickService(
      shipState, tick, new EventEmitter2(), 7500,
    );
    svc.onModuleInit();

    const physics = regs.filter((r) => r.kind === TickKind.PHYSICS);
    expect(physics.map((r) => r.order)).toContain(TickOrder.CLOAK);
  });

  it('and FLUX genuinely precedes CLOAK, so the pair is ordered', () => {
    expect(TickOrder.FLUX).toBeLessThan(TickOrder.CLOAK);
  });
});
