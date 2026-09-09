#!/usr/bin/env node
/**
 * Generate the Cybertron / Droid annoyance-message catalogues from canon.
 *
 * Source: reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG — the 3.2e SHIPPED
 * release. Do NOT point this at GE/MSG/MBMGEMSG.MSG: that is a pre-3.2d
 * snapshot which has only a generic CYBMSG1..19 set and no per-class families.
 *
 * Cybertron: `cyb_annoy` computes its message id arithmetically
 *   base = CYBBASEM + (ptr->shpclass - cyb_class) * 16
 *   sel  = (first + base) + gernd() % (last - first + 1)
 * (GECYBS.C:392-397). MajorBBS message ids are assigned by FILE ORDER, so we
 * reproduce that by index into the ordered message list. `cyb_class` is the
 * first CYBORG class = class 21 (MBMGESHP.MSG S21TYPE {..CYBORG}), and the 13
 * message families CYB1M*..CYB9M*, CYBAM*..CYBDM* cover slots 21..33 at a flat
 * stride of 16 — the <NONE> slots 26..30 still own a block.
 *
 * Droid: `droid_annoy` takes literal message ids (GEDROIDS.C:232-245), so those
 * are emitted by mnemonic.
 *
 * Usage:  node tools/extract-ai-taunts.mjs [--check]
 *   --check  parse and report counts without writing files
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MSG = resolve(ROOT, 'reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG');

const CYB_OUT = resolve(
  ROOT,
  'backend/src/game/cybertron/cyb-taunt-catalog.generated.ts',
);
const DRD_OUT = resolve(
  ROOT,
  'backend/src/game/droid/droid-annoy-catalog.generated.ts',
);

/** cyb_class — the first CYBORG slot, 1-based in our port. */
const FIRST_CLASS = 21;
const CLASS_COUNT = 13;
const PER_CLASS = 16;

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g');

/**
 * Strip the ANSI colour escapes and edge whitespace, matching how the existing
 * message catalogue (src/game/commands/messages.ts) stores canon strings:
 * the literal `***` banner and interior newlines are KEPT, trailing spaces and
 * the surrounding blank lines are not.
 */
function normalise(body) {
  return body
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

/** Ordered [name, body] pairs. Position in this array IS the message id basis. */
function parseMessages() {
  const lines = readFileSync(MSG, 'latin1').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^([A-Z][A-Z0-9_]*) \{/.exec(lines[i]);
    if (!m) continue;
    const buf = [];
    let cur = lines[i].slice(m[0].length);
    for (;;) {
      const close = cur.indexOf('}');
      if (close >= 0) {
        buf.push(cur.slice(0, close));
        break;
      }
      buf.push(cur);
      i += 1;
      if (i >= lines.length) break;
      cur = lines[i];
    }
    out.push([m[1], normalise(buf.join('\n'))]);
  }
  return out;
}

const ordered = parseMessages();
const indexOf = new Map(ordered.map(([n], i) => [n, i]));
const byName = new Map(ordered);

const base = indexOf.get('CYBBASEM');
const lastGuard = indexOf.get('CYBLASTM');
if (base === undefined || lastGuard === undefined) {
  throw new Error('CYBBASEM/CYBLASTM markers not found — wrong MSG file?');
}

// ── Cybertron: rebuild the families by the C's own arithmetic ────────────────
const cyb = {};
for (let c = 0; c < CLASS_COUNT; c += 1) {
  const family = [];
  for (let n = 1; n <= PER_CLASS; n += 1) {
    const sel = base + c * PER_CLASS + n;
    if (sel >= lastGuard) break; // `if (sel < CYBLASTM)` — GECYBS.C:399
    family.push(ordered[sel][1]);
  }
  if (family.length !== PER_CLASS) {
    throw new Error(`class ${FIRST_CLASS + c}: expected 16 messages, got ${family.length}`);
  }
  cyb[FIRST_CLASS + c] = family;
}

// Sanity: the arithmetic must land on the mnemonics we expect.
const expectFamilyHead = [
  [21, 'CYB1M1'], [22, 'CYB2M1'], [25, 'CYB5M1'],
  [30, 'CYBAM1'], [31, 'CYBBM1'], [33, 'CYBDM1'],
];
for (const [cls, name] of expectFamilyHead) {
  if (cyb[cls][0] !== byName.get(name)) {
    throw new Error(`class ${cls} did not land on ${name}`);
  }
}

// ── Droid: literal mnemonics ────────────────────────────────────────────────
const DRD_NAMES = [
  ...Array.from({ length: 15 }, (_, i) => `DRDMSG${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `DRDHLP${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `DRDHLP${i + 11}`),
];
const drd = {};
for (const name of DRD_NAMES) {
  const body = byName.get(name);
  if (body === undefined) throw new Error(`missing droid message ${name}`);
  drd[name] = body;
}

if (process.argv.includes('--check')) {
  console.log(`messages parsed: ${ordered.length}`);
  console.log(`cybertron families: ${Object.keys(cyb).length} x ${PER_CLASS}`);
  console.log(`droid messages: ${Object.keys(drd).length}`);
  process.exit(0);
}

const q = (s) => JSON.stringify(s);

const cybBody = Object.entries(cyb)
  .map(([cls, msgs]) => `  ${cls}: [\n${msgs.map((m) => `    ${q(m)},`).join('\n')}\n  ],`)
  .join('\n');

writeFileSync(
  CYB_OUT,
  `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Contains material Copyright (C) 1988-1992 Michael B. Murdock, from Galactic
 * Empire release 3.2e, released by its author under GPL-2.0-or-later. This
 * port is AGPL-3.0-or-later; see NOTICE at the repository root.
 * Regenerate with:  node tools/extract-ai-taunts.mjs
 * Pinned by:        backend/test/balance/ai-taunt-canon.balance.spec.ts
 *
 * Cybertron annoyance messages, release 3.2e.
 * Source: reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG (CYB1M1..CYBDM16).
 *
 * Keyed by our 1-based classNumber. C indexes these with
 *   base = CYBBASEM + (ptr->shpclass - cyb_class) * 16
 * on a 0-based shpclass with cyb_class = the first CYBORG slot. Our
 * classNumber is 1-based and the first CYBORG slot is 21, so the DIFFERENCE
 * (shpclass - cyb_class) is identical in both bases and no off-by-one
 * correction is needed. Stated explicitly because this project has shipped
 * index-basis bugs before.
 *
 * Slots 26..30 are <NONE> in MBMGESHP.MSG and 31..33 are DROIDs, so only
 * 21..25 are reachable in the shipped configuration — but the message blocks
 * exist for all 13, which is exactly why the stride is a flat 16.
 *
 * The %s is the taunting ship's name: prfmsg(sel, ptr->shipname).
 *
 * @see GECYBS.C:382-410 cyb_annoy
 */

/** First CYBORG class slot — C's \`cyb_class\`. @see GEMAIN.C:879-882 */
export const CYB_TAUNT_FIRST_CLASS = ${FIRST_CLASS};

/** Number of 16-message families in the block. */
export const CYB_TAUNT_CLASS_COUNT = ${CLASS_COUNT};

/** Messages per class — C's literal \`*16\` stride. @see GECYBS.C:393 */
export const CYB_TAUNTS_PER_CLASS = ${PER_CLASS};

/** classNumber -> the 16 messages M1..M16, in canon order. */
export const CYB_TAUNTS: Readonly<Record<number, readonly string[]>> = {
${cybBody}
};
`,
  'utf8',
);

const drdBody = Object.entries(drd)
  .map(([name, msg]) => `  ${name}: ${q(msg)},`)
  .join('\n');

writeFileSync(
  DRD_OUT,
  `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Contains material Copyright (C) 1988-1992 Michael B. Murdock, from Galactic
 * Empire release 3.2e, released by its author under GPL-2.0-or-later. This
 * port is AGPL-3.0-or-later; see NOTICE at the repository root.
 * Regenerate with:  node tools/extract-ai-taunts.mjs
 * Pinned by:        backend/test/balance/ai-taunt-canon.balance.spec.ts
 *
 * Droid annoyance messages, release 3.2e.
 * Source: reference/ge-upstream/mbmgemp/GE/REL/MBMGEMSG.MSG (DRDMSG*, DRDHLP*).
 *
 * Unlike cyb_annoy, droid_annoy is handed literal message ids, so these are
 * keyed by mnemonic and sliced by the call sites in GEDROIDS.C.
 *
 * The %s is the droid's ship name: prfmsg(..., ptr->shipname).
 *
 * @see GEDROIDS.C:232-245 droid_annoy
 */

export const DRD_ANNOY: Readonly<Record<string, string>> = {
${drdBody}
};
`,
  'utf8',
);

console.log(`wrote ${CYB_OUT}`);
console.log(`wrote ${DRD_OUT}`);
