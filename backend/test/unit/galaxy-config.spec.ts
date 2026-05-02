import { loadGalaxyConfig, parseUint32, parseRange, GalaxyConfigError } from '../../src/game/galaxy/galaxy.config';

describe('galaxy config loader', () => {
  // ── G6: defaults ──────────────────────────────────────────────────────────

  describe('defaults (G6)', () => {
    it('returns default seed (0xC0FFEE = 12648430) when GALAXY_SEED is unset', () => {
      const config = loadGalaxyConfig({});
      expect(config.seed).toBe(12648430);
    });

    it('returns default plodds (4) when GALAXY_PLODDS is unset', () => {
      const config = loadGalaxyConfig({});
      expect(config.plodds).toBe(4);
    });

    it('returns default wormodds (10) when GALAXY_WORMODDS is unset', () => {
      const config = loadGalaxyConfig({});
      expect(config.wormodds).toBe(10);
    });

    it('returns default maxplanets (5) when GALAXY_MAXPLANETS is unset', () => {
      const config = loadGalaxyConfig({});
      expect(config.maxplanets).toBe(5);
    });
  });

  // ── Hex parsing ───────────────────────────────────────────────────────────

  describe('hex parsing', () => {
    it('parses 0xC0FFEE as 12648430', () => {
      const config = loadGalaxyConfig({ GALAXY_SEED: '0xC0FFEE' });
      expect(config.seed).toBe(12648430);
    });

    it('parses lowercase 0xc0ffee as 12648430', () => {
      const config = loadGalaxyConfig({ GALAXY_SEED: '0xc0ffee' });
      expect(config.seed).toBe(12648430);
    });
  });

  // ── Underscore decimal parsing ─────────────────────────────────────────────

  describe('underscore decimal parsing', () => {
    it('parses 12_648_430 as 12648430', () => {
      const config = loadGalaxyConfig({ GALAXY_SEED: '12_648_430' });
      expect(config.seed).toBe(12648430);
    });
  });

  // ── Boundary validation: plodds ───────────────────────────────────────────

  describe('plodds boundary validation', () => {
    it('throws when plodds=0 (below min 1)', () => {
      expect(() => loadGalaxyConfig({ GALAXY_PLODDS: '0' })).toThrow(GalaxyConfigError);
    });

    it('error message names GALAXY_PLODDS and the bad value when plodds=0', () => {
      expect(() => loadGalaxyConfig({ GALAXY_PLODDS: '0' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('GALAXY_PLODDS') }),
      );
      expect(() => loadGalaxyConfig({ GALAXY_PLODDS: '0' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('0') }),
      );
    });

    it('throws when plodds=21 (above max 20)', () => {
      expect(() => loadGalaxyConfig({ GALAXY_PLODDS: '21' })).toThrow(GalaxyConfigError);
    });

    it('error message names GALAXY_PLODDS and the bad value when plodds=21', () => {
      expect(() => loadGalaxyConfig({ GALAXY_PLODDS: '21' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('GALAXY_PLODDS') }),
      );
      expect(() => loadGalaxyConfig({ GALAXY_PLODDS: '21' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('21') }),
      );
    });

    it('accepts plodds=1 (min boundary)', () => {
      expect(() => loadGalaxyConfig({ GALAXY_PLODDS: '1' })).not.toThrow();
      expect(loadGalaxyConfig({ GALAXY_PLODDS: '1' }).plodds).toBe(1);
    });

    it('accepts plodds=20 (max boundary)', () => {
      expect(() => loadGalaxyConfig({ GALAXY_PLODDS: '20' })).not.toThrow();
      expect(loadGalaxyConfig({ GALAXY_PLODDS: '20' }).plodds).toBe(20);
    });
  });

  // ── Boundary validation: wormodds ─────────────────────────────────────────

  describe('wormodds boundary validation', () => {
    it('throws when wormodds=0 (below min 1)', () => {
      expect(() => loadGalaxyConfig({ GALAXY_WORMODDS: '0' })).toThrow(GalaxyConfigError);
    });

    it('error message names GALAXY_WORMODDS and the bad value when wormodds=0', () => {
      expect(() => loadGalaxyConfig({ GALAXY_WORMODDS: '0' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('GALAXY_WORMODDS') }),
      );
      expect(() => loadGalaxyConfig({ GALAXY_WORMODDS: '0' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('0') }),
      );
    });

    it('throws when wormodds=101 (above max 100)', () => {
      expect(() => loadGalaxyConfig({ GALAXY_WORMODDS: '101' })).toThrow(GalaxyConfigError);
    });

    it('error message names GALAXY_WORMODDS and the bad value when wormodds=101', () => {
      expect(() => loadGalaxyConfig({ GALAXY_WORMODDS: '101' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('GALAXY_WORMODDS') }),
      );
      expect(() => loadGalaxyConfig({ GALAXY_WORMODDS: '101' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('101') }),
      );
    });

    it('accepts wormodds=1 (min boundary)', () => {
      expect(loadGalaxyConfig({ GALAXY_WORMODDS: '1' }).wormodds).toBe(1);
    });

    it('accepts wormodds=100 (max boundary)', () => {
      expect(loadGalaxyConfig({ GALAXY_WORMODDS: '100' }).wormodds).toBe(100);
    });
  });

  // ── Boundary validation: maxplanets ───────────────────────────────────────

  describe('maxplanets boundary validation', () => {
    it('throws when maxplanets=0 (below min 1)', () => {
      expect(() => loadGalaxyConfig({ GALAXY_MAXPLANETS: '0' })).toThrow(GalaxyConfigError);
    });

    it('error message names GALAXY_MAXPLANETS and the bad value when maxplanets=0', () => {
      expect(() => loadGalaxyConfig({ GALAXY_MAXPLANETS: '0' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('GALAXY_MAXPLANETS') }),
      );
      expect(() => loadGalaxyConfig({ GALAXY_MAXPLANETS: '0' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('0') }),
      );
    });

    it('throws when maxplanets=10 (above max 9)', () => {
      expect(() => loadGalaxyConfig({ GALAXY_MAXPLANETS: '10' })).toThrow(GalaxyConfigError);
    });

    it('error message names GALAXY_MAXPLANETS and the bad value when maxplanets=10', () => {
      expect(() => loadGalaxyConfig({ GALAXY_MAXPLANETS: '10' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('GALAXY_MAXPLANETS') }),
      );
      expect(() => loadGalaxyConfig({ GALAXY_MAXPLANETS: '10' })).toThrow(
        expect.objectContaining({ message: expect.stringContaining('10') }),
      );
    });

    it('accepts maxplanets=1 (min boundary)', () => {
      expect(loadGalaxyConfig({ GALAXY_MAXPLANETS: '1' }).maxplanets).toBe(1);
    });

    it('accepts maxplanets=9 (max boundary)', () => {
      expect(loadGalaxyConfig({ GALAXY_MAXPLANETS: '9' }).maxplanets).toBe(9);
    });
  });

  // ── parseUint32 unit tests ─────────────────────────────────────────────────

  describe('parseUint32', () => {
    it('returns defaultVal when raw is undefined', () => {
      expect(parseUint32(undefined, 42, 'FIELD')).toBe(42);
    });

    it('returns defaultVal when raw is empty string', () => {
      expect(parseUint32('', 42, 'FIELD')).toBe(42);
    });

    it('accepts max uint32 (4294967295)', () => {
      expect(parseUint32('4294967295', 0, 'FIELD')).toBe(4294967295);
    });

    it('throws when value exceeds uint32 max', () => {
      expect(() => parseUint32('4294967296', 0, 'FIELD')).toThrow(GalaxyConfigError);
    });

    it('throws when value is negative', () => {
      expect(() => parseUint32('-1', 0, 'FIELD')).toThrow(GalaxyConfigError);
    });

    it('names the field in the error message', () => {
      expect(() => parseUint32('4294967296', 0, 'MY_FIELD')).toThrow(
        expect.objectContaining({ message: expect.stringContaining('MY_FIELD') }),
      );
    });
  });

  // ── parseRange unit tests ──────────────────────────────────────────────────

  describe('parseRange', () => {
    it('returns defaultVal when raw is undefined', () => {
      expect(parseRange(undefined, 7, 1, 10, 'FIELD')).toBe(7);
    });

    it('returns defaultVal when raw is empty string', () => {
      expect(parseRange('', 7, 1, 10, 'FIELD')).toBe(7);
    });

    it('accepts values at the min boundary', () => {
      expect(parseRange('1', 5, 1, 10, 'FIELD')).toBe(1);
    });

    it('accepts values at the max boundary', () => {
      expect(parseRange('10', 5, 1, 10, 'FIELD')).toBe(10);
    });

    it('throws for value below min — no silent clamping', () => {
      expect(() => parseRange('0', 5, 1, 10, 'FIELD')).toThrow(GalaxyConfigError);
    });

    it('throws for value above max — no silent clamping', () => {
      expect(() => parseRange('11', 5, 1, 10, 'FIELD')).toThrow(GalaxyConfigError);
    });

    it('names the field and offending value in the error message', () => {
      expect(() => parseRange('0', 5, 1, 10, 'MY_FIELD')).toThrow(
        expect.objectContaining({
          message: expect.stringMatching(/MY_FIELD.*0|0.*MY_FIELD/),
        }),
      );
    });
  });
});
