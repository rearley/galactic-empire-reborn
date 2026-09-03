/**
 * Cybertron / Droid annoyance-message conformance to canon.
 *
 * Release 3.2e added per-class Cybertron taunt families (CYB1M1..CYBDM16) and
 * the droid DRDMSG/DRDHLP families. This spec re-parses the ORIGINAL shipped
 * message file at test time and asserts that our generated catalogues are
 * character-for-character the same text.
 *
 * It deliberately re-implements the parse rather than importing
 * tools/extract-ai-taunts.mjs, so a bug in the generator cannot hide behind a
 * test that shares it.
 *
 * SOURCE PRECEDENCE — this reads GE/REL/MBMGEMSG.MSG, the 3.2e shipped release.
 * GE/MSG/MBMGEMSG.MSG is a pre-3.2d snapshot that carries only a generic
 * CYBMSG1..19 set and must not be used.
 *
 * @see reference/ge-upstream/PROVENANCE.md
 * @see GECYBS.C:382-410 cyb_annoy
 * @see GEDROIDS.C:232-245 droid_annoy
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CYB_TAUNTS,
  CYB_TAUNT_FIRST_CLASS,
  CYB_TAUNT_CLASS_COUNT,
  CYB_TAUNTS_PER_CLASS,
} from '../../src/game/cybertron/cyb-taunt-catalog.generated';
import { DRD_ANNOY } from '../../src/game/droid/droid-annoy-catalog.generated';

const MSG = resolve(
  __dirname,
  '../../../reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG',
);

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g');

/** Same normalisation the message catalogue applies: drop ANSI, trim edges. */
function normalise(body: string): string {
  return body
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

/** Ordered [name, body] pairs, in the file order that gives each its message id. */
function parseMessages(): Array<[string, string]> {
  const lines = readFileSync(MSG, 'latin1').split(/\r?\n/);
  const out: Array<[string, string]> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^([A-Z][A-Z0-9_]*) \{/.exec(lines[i]!);
    if (!m) continue;
    const buf: string[] = [];
    let cur = lines[i]!.slice(m[0].length);
    for (;;) {
      const close = cur.indexOf('}');
      if (close >= 0) {
        buf.push(cur.slice(0, close));
        break;
      }
      buf.push(cur);
      i += 1;
      if (i >= lines.length) break;
      cur = lines[i]!;
    }
    out.push([m[1]!, normalise(buf.join('\n'))]);
  }
  return out;
}

const ORDERED = parseMessages();
const BY_NAME = new Map(ORDERED);
const INDEX_OF = new Map(ORDERED.map(([n], i) => [n, i] as const));

describe('Cybertron taunt catalogue matches MBMGEMSG.MSG (3.2e)', () => {
  it('has the 13 x 16 block the flat stride-of-16 arithmetic assumes', () => {
    const base = INDEX_OF.get('CYBBASEM')!;
    const last = INDEX_OF.get('CYBLASTM')!;
    expect(base).toBeGreaterThanOrEqual(0);
    // 13 families x 16 = 208 messages sit immediately after CYBBASEM.
    expect(INDEX_OF.get('CYBDM16')! - base).toBe(208);
    // The `if (sel < CYBLASTM)` guard therefore never trips for classes 21..33.
    expect(last).toBeGreaterThan(base + 208);
  });

  it('maps class 21->CYB1M*, 30->CYBAM*, 33->CYBDM* by the C arithmetic', () => {
    expect(CYB_TAUNT_FIRST_CLASS).toBe(21);
    expect(CYB_TAUNT_CLASS_COUNT).toBe(13);
    expect(CYB_TAUNTS_PER_CLASS).toBe(16);
    expect(CYB_TAUNTS[21]![0]).toBe(BY_NAME.get('CYB1M1'));
    expect(CYB_TAUNTS[30]![0]).toBe(BY_NAME.get('CYBAM1'));
    expect(CYB_TAUNTS[33]![15]).toBe(BY_NAME.get('CYBDM16'));
  });

  it('reproduces every one of the 208 messages exactly', () => {
    const base = INDEX_OF.get('CYBBASEM')!;
    for (let c = 0; c < 13; c += 1) {
      const cls = 21 + c;
      expect(CYB_TAUNTS[cls]).toHaveLength(16);
      for (let n = 1; n <= 16; n += 1) {
        // sel = CYBBASEM + (shpclass - cyb_class)*16 + n   @see GECYBS.C:392-397
        const expected = ORDERED[base + c * 16 + n]![1];
        expect(CYB_TAUNTS[cls]![n - 1]).toBe(expected);
      }
    }
  });

  it('keeps the %s shipname slot that prfmsg(sel, ptr->shipname) feeds', () => {
    for (const cls of Object.keys(CYB_TAUNTS).map(Number)) {
      for (const msg of CYB_TAUNTS[cls]!) {
        expect(msg).toContain('%s');
      }
    }
  });
});

describe('Droid annoy catalogue matches MBMGEMSG.MSG (3.2e)', () => {
  const NAMES = [
    ...Array.from({ length: 5 }, (_, i) => `DRDMSG${i + 1}`),
    ...Array.from({ length: 5 }, (_, i) => `DRDHLP${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `DRDMSG${i + 6}`),
    ...Array.from({ length: 5 }, (_, i) => `DRDHLP${i + 11}`),
  ];

  it('carries all 25 DRD messages verbatim', () => {
    for (const name of NAMES) {
      expect(DRD_ANNOY[name]).toBe(BY_NAME.get(name));
    }
  });

  it('has the DRD ranges contiguous, as droid_annoy assumes', () => {
    // droid_annoy does first+gernd()%(last-first+1) over raw message ids, so
    // each [first,last] pair must be five consecutive ids in FILE order.
    const pairs: Array<[string, string]> = [
      ['DRDMSG1', 'DRDMSG5'],
      ['DRDHLP1', 'DRDHLP5'],
      ['DRDMSG11', 'DRDMSG15'],
      ['DRDHLP11', 'DRDHLP15'],
    ];
    for (const [a, b] of pairs) {
      expect(INDEX_OF.get(b)! - INDEX_OF.get(a)!).toBe(4);
    }
  });
});
