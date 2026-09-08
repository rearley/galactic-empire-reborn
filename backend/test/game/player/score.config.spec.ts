/**
 * score.config used to own a private `SCORE_F2` environment variable with a
 * hardcoded default of 100, while the sysop option table carried the same
 * setting as `SCRFACT` with canon's default of 35, marked `implemented: false`.
 * Neither half knew about the other: `SCRFACT` did nothing wherever you set it,
 * and the game deducted 100 where the original deducts 35.
 *
 * The setting now resolves through the central manifest. These tests pin the
 * integration — that `scoreF2` really is `SCRFACT` and not a second opinion.
 *
 * The input-hygiene rules this file used to guard (non-numeric rejected rather
 * than yielding NaN, trailing garbage rejected rather than truncated,
 * whitespace treated as unset rather than as zero) moved WITH the setting and
 * are pinned in test/unit/config/config-env-hygiene.spec.ts. They were the
 * reason merging needed care, so they are tested, not dropped.
 *
 * @see GEMAIN.C:603 — score_f2 = numopt(SCRFACT,0,32700)
 * @see GE/REL/MBMGEMSG.MSG:472 — SCRFACT {...: 35} N 1 100
 */
import { resolveGameConfig } from '../../../src/game/config/game-config';

const NO_FILE = { path: '/nonexistent/game.config.json' };

describe('scoreF2 is SCRFACT, not a second opinion', () => {
  it('is exactly the resolved SCRFACT constant', async () => {
    const { scoreF2 } = await import('../../../src/game/player/score.config');
    const { SCRFACT } = await import('../../../src/game/constants');
    expect(scoreF2).toBe(SCRFACT);
  });

  it('deploys at canon 35', async () => {
    // Was 100 for a day, as a declared deviation — but nobody had ever CHOSEN
    // 100. It was an artefact of score.config.ts hardcoding its own default
    // while SCRFACT sat in the option table marked unimplemented. Once that was
    // understood, and while the public galaxy still had no scores in it, it
    // went back to canon: MBMGEMSG.MSG:472 "Factor points to deduct from
    // loser: 35". Asserted rather than assumed, because a silent change here
    // revalues every kill in the game.
    const { scoreF2 } = await import('../../../src/game/player/score.config');
    expect(scoreF2).toBe(35);
  });
});

describe('SCRFACT resolves through the central manifest', () => {
  it('falls back to canon 35 with no file and no environment', () => {
    expect(resolveGameConfig({ ...NO_FILE, env: {} }).SCRFACT).toBe(35);
  });

  it('is settable from the environment under its canon name', () => {
    expect(resolveGameConfig({ ...NO_FILE, env: { SCRFACT: '250' } }).SCRFACT).toBe(250);
  });

  it('accepts the bounds canon clamps to', () => {
    expect(resolveGameConfig({ ...NO_FILE, env: { SCRFACT: '0' } }).SCRFACT).toBe(0);
    expect(resolveGameConfig({ ...NO_FILE, env: { SCRFACT: '32700' } }).SCRFACT).toBe(32700);
  });

  it('CLAMPS out of range rather than throwing, because numopt clamps', () => {
    // The old private loader threw on -1 and on 32701. That was a port
    // invention: canon's numopt(SCRFACT,0,32700) clamps, and a clamp is
    // reported as a warning naming the C reference. Per the project rule, a
    // test encoding a deviation from canon is the thing that is wrong.
    const low = resolveGameConfig({ ...NO_FILE, env: { SCRFACT: '-1' } });
    const high = resolveGameConfig({ ...NO_FILE, env: { SCRFACT: '32701' } });
    expect(low.SCRFACT).toBe(0);
    expect(high.SCRFACT).toBe(32700);
    expect(low.warnings.join(' ')).toMatch(/SCRFACT/);
    expect(high.warnings.join(' ')).toMatch(/GEMAIN\.C:603/);
  });
});
