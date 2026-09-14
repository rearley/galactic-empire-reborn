#!/usr/bin/env node
/**
 * Fail the build when a redacted identifier reappears anywhere in the tree.
 *
 * WHY THIS EXISTS
 *
 * Over two days, four redactions were undone by the very writing that recorded
 * them — an email address, a live colony's figures, a config path prefix, and a
 * firewall rule, each reintroduced in the sentence explaining its removal, and
 * three of the four pushed. Every one landed in the gap between running a
 * manual sweep and running `git add`.
 *
 * In the same period the citation ratchet caught the same author twice, before
 * anything shipped. One problem had a test; the other had good intentions. This
 * closes that asymmetry.
 *
 * THE VOCABULARY IS HASHED, NOT LISTED
 *
 * A file enumerating the strings you are trying to hide is itself the
 * disclosure — doubly so in a repository about to go public. So
 * `forbidden-identifiers.sha256` holds SHA-256 digests only. The guard hashes
 * candidate tokens out of each file and compares. It can therefore tell you
 * that line 12 of a file is forbidden without anyone, including this program,
 * being able to read the list back.
 *
 * The cost of that choice is honest: this matches whole tokens, not arbitrary
 * substrings or phrases. That suits what it is for — hostnames, domains, paths,
 * product names, account names, distinctive numbers — and does not suit prose.
 *
 * USAGE
 *
 *   node tools/identifier-guard.mjs            # scan; exit 1 on a hit
 *   node tools/identifier-guard.mjs --json     # machine-readable, for the test
 *   node tools/identifier-guard.mjs --add TERM # append TERM's hash, never TERM
 *   node tools/identifier-guard.mjs --check-message FILE   # for a commit hook
 */

import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HASH_FILE = 'tools/forbidden-identifiers.sha256';

/** Files whose own content is the guard's machinery, or is not ours to police. */
/**
 * Only the digest list is exempt, and only because it cannot leak by
 * construction. This program and its spec ARE scanned: excluding them is how
 * the first draft came to carry the very strings it suppresses.
 */
const SKIP = [HASH_FILE];
const SKIP_DIRS = ['reference/', 'node_modules/', 'dist/'];

/** SHA-256 of a term, normalised the same way candidate tokens are. */
export function hashTerm(term) {
  return createHash('sha256').update(normalise(term)).digest('hex');
}

/**
 * Lowercase, and drop the separators that vary between a path, a sentence and a
 * formatted number. `987,654`, `987654` and `987.654` all normalise alike, as do
 * `/etc/example/` and `etc/example`.

 * Examples here are invented on purpose. An earlier draft illustrated the rules
 * with the real strings it exists to suppress, and then excluded this file from
 * its own scan so it would not flag them — which is how a guard acquires the
 * blind spot it was written to remove.
 */
function normalise(s) {
  return s.toLowerCase().replace(/[,\s]/g, '').replace(/^[./]+|[./]+$/g, '');
}

/** Every token in a line that could plausibly be an identifier. */
function tokens(line) {
  const out = new Set();
  const RUN = /[A-Za-z0-9][A-Za-z0-9._@/+-]*/g;
  for (const m of line.matchAll(RUN)) {
    const raw = m[0];
    out.add(raw);
    // A compound like `user@example.com` or `etc/example/var` also yields its parts
    // and its leading pairs, so a path prefix is caught inside a longer path.
    const parts = raw.split(/[@/]/).filter(Boolean);
    parts.forEach((p) => out.add(p));
    for (let i = 1; i < parts.length; i++) out.add(parts.slice(0, i + 1).join('/'));
  }
  // Digit groups with separators stripped, so `987,654` is seen as `987654`.
  for (const m of line.matchAll(/[0-9][0-9,]{2,}/g)) out.add(m[0].replace(/,/g, ''));
  return out;
}

/** Hits in one blob of text, as 1-based line numbers. Never returns the match. */
export function scanText(text, hashes) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    for (const t of tokens(line)) {
      const h = hashTerm(t);
      if (hashes.has(h)) {
        hits.push({ line: i + 1, hash: h.slice(0, 12) });
        break; // one report per line is enough to send someone to it
      }
    }
  });
  return hits;
}

export function loadHashes(repo) {
  const p = join(repo, HASH_FILE);
  if (!existsSync(p)) return new Set();
  return new Set(
    readFileSync(p, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')),
  );
}

function trackedFiles(repo) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8', maxBuffer: 64e6 })
    .split('\0')
    .filter(Boolean)
    .filter((f) => !SKIP.includes(f) && !SKIP_DIRS.some((d) => f.startsWith(d)));
}

function scanRepo(repo) {
  const hashes = loadHashes(repo);
  const hits = [];
  for (const f of trackedFiles(repo)) {
    let text;
    try {
      text = readFileSync(join(repo, f), 'utf8');
    } catch {
      continue; // binary or unreadable; nothing to read an identifier out of
    }
    if (text.includes('\0')) continue;
    for (const h of scanText(text, hashes)) hits.push({ file: f, ...h });
  }
  return hits;
}

function main() {
  const repo = resolve(HERE, '..');
  const args = process.argv.slice(2);

  if (args[0] === '--add') {
    const term = args[1];
    if (!term) { console.error('usage: --add TERM'); process.exit(2); }
    const h = hashTerm(term);
    if (loadHashes(repo).has(h)) { console.log('already present'); return; }
    appendFileSync(join(repo, HASH_FILE), `${h}\n`);
    console.log(`added (${h.slice(0, 12)}…) — the term itself was not written anywhere`);
    return;
  }

  if (args[0] === '--check-message') {
    const hits = scanText(readFileSync(args[1], 'utf8'), loadHashes(repo));
    if (hits.length) {
      console.error('\nCOMMIT MESSAGE contains a forbidden identifier:');
      hits.forEach((h) => console.error(`  line ${h.line}  (hash ${h.hash}…)`));
      console.error('\nDescribe the value; do not restate it.\n');
      process.exit(1);
    }
    return;
  }

  const hits = scanRepo(repo);
  if (args.includes('--json')) { console.log(JSON.stringify(hits, null, 2)); return; }
  if (hits.length) {
    console.error(`\n${hits.length} forbidden identifier(s):`);
    hits.forEach((h) => console.error(`  ${h.file}:${h.line}  (hash ${h.hash}…)`));
    console.error('\nThe match is not printed — that would be the leak. Open the line.\n');
    process.exit(1);
  }
  console.log('clean');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
