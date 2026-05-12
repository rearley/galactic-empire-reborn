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
        const msg = err instanceof Error ? err.message : String(err);
        out.push({
          rule: `${inv.name}:internal-error`,
          sourceRef: inv.sourceRef,
          severity: 'MEDIUM',
          detail: `invariant threw: ${msg}`,
        });
      }
    }
    return out;
  }
}
