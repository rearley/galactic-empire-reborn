import { Invariant, Violation, WorldSnapshot } from './invariants.types';

export { Invariant, Violation, WorldSnapshot };

export class InvariantRegistry {
  private invariants: Invariant[] = [];

  register(inv: Invariant): void {
    this.invariants.push(inv);
  }

  runAll(world: WorldSnapshot): Violation[] {
    const out: Violation[] = [];
    for (const inv of this.invariants) {
      try {
        out.push(...inv.run(world));
      } catch (err) {
        out.push({
          rule: inv.name,
          sourceRef: inv.sourceRef,
          severity: 'HIGH',
          detail: `invariant threw: ${(err as Error).message}`,
        });
      }
    }
    return out;
  }

  count(): number {
    return this.invariants.length;
  }
}
