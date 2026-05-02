import { Rng } from '../../src/game/galaxy/rng';

describe('Rng (Mulberry32)', () => {
  describe('determinism', () => {
    it('produces identical sequences from the same seed over 1000 draws', () => {
      const seed = 0xdeadbeef;
      const a = new Rng(seed);
      const b = new Rng(seed);

      for (let i = 0; i < 1000; i++) {
        expect(a.next()).toBe(b.next());
      }
    });

    it('diverges from a different seed within the first 10 draws', () => {
      const a = new Rng(12345);
      const b = new Rng(99999);

      const valuesA: number[] = [];
      const valuesB: number[] = [];
      for (let i = 0; i < 10; i++) {
        valuesA.push(a.next());
        valuesB.push(b.next());
      }

      // At least one value must differ
      const anyDiverge = valuesA.some((v, i) => v !== valuesB[i]);
      expect(anyDiverge).toBe(true);
    });
  });

  describe('next()', () => {
    it('returns floats in [0, 1)', () => {
      const rng = new Rng(42);
      for (let i = 0; i < 1000; i++) {
        const v = rng.next();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });

  describe('intBelow()', () => {
    it('stays within 0..N-1 for N=100 over 10,000 draws', () => {
      const rng = new Rng(0xcafe1234);
      const N = 100;

      for (let i = 0; i < 10_000; i++) {
        const v = rng.intBelow(N);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(N);
        expect(Number.isInteger(v)).toBe(true);
      }
    });

    it('covers all values in range for small N over many draws', () => {
      const rng = new Rng(0x1234abcd);
      const N = 6;
      const seen = new Set<number>();

      for (let i = 0; i < 10_000; i++) {
        seen.add(rng.intBelow(N));
      }

      // All values 0..N-1 should have appeared
      for (let v = 0; v < N; v++) {
        expect(seen.has(v)).toBe(true);
      }
    });
  });
});
