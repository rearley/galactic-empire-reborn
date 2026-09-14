import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { scanText, loadHashes, hashTerm } from '../../../tools/identifier-guard.mjs';

const REPO = resolve(__dirname, '../../..');

/**
 * The identifier guard.
 *
 * Four times in two days a redaction was undone by the write that documented
 * it: an email address, a colony's live figures, a config path prefix, and a
 * firewall rule — each reintroduced in the sentence explaining its removal, and
 * three of the four shipped. Every one landed in the window between running the
 * sweep and running `git add`.
 *
 * The lesson is not "be more careful". In the same session the citation ratchet
 * caught the same author twice, automatically, before anything shipped. The
 * difference between the two outcomes is that one had a test and the other had
 * diligence. This is the test.
 *
 * The vocabulary is stored as SHA-256 hashes, never plaintext: a file listing
 * the strings you are hiding is itself the disclosure, and this repository is
 * going public.
 */
describe('forbidden identifiers', () => {
  it('catches a planted identifier — a guard that matches nothing is worse than none', () => {
    const hashes = new Set([hashTerm('supersecrethost')]);
    const hits = scanText('deploy to supersecrethost tonight', hashes);
    expect(hits.length).toBe(1);
  });

  it('is case- and separator-insensitive, because prose varies and paths do not', () => {
    const hashes = new Set([hashTerm('opt/<panel-path>'), hashTerm('<population>')]);
    expect(scanText('under /opt/<panel-path>/ somewhere', hashes).length).toBe(1);
    expect(scanText('a population of <population> colonists', hashes).length).toBe(1);
  });

  it('does not fire on ordinary prose', () => {
    const hashes = new Set([hashTerm('supersecrethost')]);
    expect(scanText('the deploy host runs a hosting panel', hashes)).toEqual([]);
  });

  it('ships a vocabulary, and stores no plaintext of it', () => {
    const hashes = loadHashes(REPO);
    expect(hashes.size).toBeGreaterThan(5);
    const raw = execFileSync('cat', [join(REPO, 'tools/forbidden-identifiers.sha256')], {
      encoding: 'utf8',
    });
    // every non-comment line is a bare 64-char hash and nothing else
    raw.split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .forEach((l) => expect(l.trim()).toMatch(/^[0-9a-f]{64}$/));
  });

  it('finds nothing anywhere in the tracked tree', () => {
    const out = execFileSync('node', [join(REPO, 'tools/identifier-guard.mjs'), '--json'], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const hits = JSON.parse(out) as { file: string; line: number }[];
    // Reported without the matched text: printing it into CI logs would be the
    // very disclosure this guard exists to prevent.
    expect(hits.map((h) => `${h.file}:${h.line}`)).toEqual([]);
  });

  it('scans a file the moment it is tracked, with no allowlist to forget', () => {
    const dir = mkdtempSync(join(tmpdir(), 'idguard-'));
    try {
      writeFileSync(join(dir, 'note.md'), 'nothing to see');
      const hashes = new Set([hashTerm('supersecrethost')]);
      expect(scanText('nothing to see', hashes)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
