/**
 * Tests for score.config.ts — SCORE_F2 env var loading and range validation.
 * @see GEMAIN.C:603  numopt(SCRFACT, 0, 32700)
 */
describe('score.config', () => {
  const originalEnv = process.env['SCORE_F2'];

  afterEach(() => {
    // Restore original env var after each test
    if (originalEnv === undefined) {
      delete process.env['SCORE_F2'];
    } else {
      process.env['SCORE_F2'] = originalEnv;
    }
    // Clear module registry so next test gets a fresh import
    jest.resetModules();
  });

  it('defaults to 100 when SCORE_F2 is not set', async () => {
    delete process.env['SCORE_F2'];
    await jest.isolateModulesAsync(async () => {
      const { scoreF2 } = await import('../../../src/game/player/score.config');
      expect(scoreF2).toBe(100);
    });
  });

  it('reads SCORE_F2 from environment', async () => {
    process.env['SCORE_F2'] = '250';
    await jest.isolateModulesAsync(async () => {
      const { scoreF2 } = await import('../../../src/game/player/score.config');
      expect(scoreF2).toBe(250);
    });
  });

  it('accepts 0 (minimum valid value)', async () => {
    process.env['SCORE_F2'] = '0';
    await jest.isolateModulesAsync(async () => {
      const { scoreF2 } = await import('../../../src/game/player/score.config');
      expect(scoreF2).toBe(0);
    });
  });

  it('accepts 32700 (maximum valid value)', async () => {
    process.env['SCORE_F2'] = '32700';
    await jest.isolateModulesAsync(async () => {
      const { scoreF2 } = await import('../../../src/game/player/score.config');
      expect(scoreF2).toBe(32700);
    });
  });

  it('throws when SCORE_F2 is negative', async () => {
    process.env['SCORE_F2'] = '-1';
    await expect(
      jest.isolateModulesAsync(async () => {
        await import('../../../src/game/player/score.config');
      }),
    ).rejects.toThrow('SCORE_F2 out of range [0, 32700]: -1');
  });

  it('throws when SCORE_F2 exceeds 32700', async () => {
    process.env['SCORE_F2'] = '32701';
    await expect(
      jest.isolateModulesAsync(async () => {
        await import('../../../src/game/player/score.config');
      }),
    ).rejects.toThrow('SCORE_F2 out of range [0, 32700]: 32701');
  });
});
