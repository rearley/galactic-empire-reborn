import { InvariantRegistry, Violation } from '../../src/game/invariants/harness';

describe('InvariantRegistry', () => {
  it('runs registered invariants and aggregates violations', () => {
    const registry = new InvariantRegistry();
    registry.register({
      name: 'always-fails',
      sourceRef: 'TEST',
      run: () => [{ rule: 'always-fails', sourceRef: 'TEST', severity: 'HIGH', detail: 'x' }],
    });
    registry.register({
      name: 'always-passes',
      sourceRef: 'TEST',
      run: () => [],
    });

    const result: Violation[] = registry.runAll({});

    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('always-fails');
  });

  it('isolates a throwing invariant and reports it as a violation', () => {
    const registry = new InvariantRegistry();
    registry.register({
      name: 'throws',
      sourceRef: 'TEST',
      run: () => { throw new Error('boom'); },
    });

    const result = registry.runAll({});

    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('throws:internal-error');
    expect(result[0].severity).toBe('MEDIUM');
    expect(result[0].detail).toContain('boom');
  });
});
