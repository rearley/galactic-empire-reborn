/**
 * The founder secret must come from a CSPRNG.
 *
 * It is the credential gating `tea newpass`, `tea newname` and `tea kick` —
 * guessing or predicting it is a team takeover. It was drawn from
 * `Math.random()`, which is a deterministic PRNG whose internal state can be
 * recovered from a handful of outputs: an attacker who founds two teams of
 * their own and reads their secrets is in a position to predict the next one
 * anybody is issued.
 *
 * This is also the project's own rule — `random.port.ts` opens with "never use
 * Math.random() inline" — applied to a case outside combat.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TeamService } from '../../src/game/team/team.service';

const RAW = readFileSync(
  resolve(__dirname, '../../src/game/team/team.service.ts'),
  'utf8',
);

/**
 * Comments stripped: the fix explains itself by NAMING Math.random, which made
 * the first version of this test fail on its own documentation.
 */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const generate = (): string =>
  (TeamService as unknown as { generateSecret: () => string }).generateSecret();

describe('founder secret', () => {
  it('does not use Math.random', () => {
    expect(SRC).not.toMatch(/Math\.random\s*\(/);
  });

  it('draws from node:crypto', () => {
    expect(RAW).toMatch(/from 'node:crypto'/);
  });

  it('keeps the screen-safe alphabet and length', () => {
    // No I/O/0/1 — the founder reads this off a terminal and types it back.
    for (let i = 0; i < 200; i++) {
      const s = generate();
      expect(s).toHaveLength(8);
      expect(s).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it('does not repeat across a large sample', () => {
    const seen = new Set(Array.from({ length: 500 }, generate));
    expect(seen.size).toBe(500);
  });

  it('uses the whole alphabet, not a biased slice', () => {
    // randomInt(n) is unbiased; a naive `% n` over a power-of-two source is not.
    const chars = new Set(Array.from({ length: 2000 }, generate).join(''));
    expect(chars.size).toBe(32);
  });
});
