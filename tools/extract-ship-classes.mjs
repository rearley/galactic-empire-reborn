#!/usr/bin/env node
/**
 * Extract the authoritative ship class table from the original MBMGESHP.MSG.
 *
 * The distribution stores each class as 28 sequential options:
 *
 *     S01SRNG {  Scan Range: 100000}
 *
 * The value inside the braces (after the last `: ` or `? `) is the DEFAULT.
 * GEMAIN.C:835-875 binds them to struct fields by READ ORDER via ++classbase --
 * the mnemonic names carry no meaning to the game. This script therefore keys
 * off FIELDS below, whose order is copied from that loop, and asserts every
 * class presents its options in exactly that sequence before trusting a parse.
 *
 * Classes whose TYPE is <NONE> are unused slots and are skipped; several carry
 * stale leftover names (26-30 all read "Cybertron Battle Cruiser").
 *
 * Usage: node tools/extract-ship-classes.mjs [--json|--ts]
 *
 * `--ts` regenerates backend/prisma/seed/ship-classes.ts. The seed is a
 * GENERATED artifact -- edit canon or this script, never the seed by hand.
 *
 * @see reference/ge-upstream/PROVENANCE.md
 * @see GEMAIN.C:835-875
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../reference/ge-upstream/mbmgemp/GE/REL/MBMGESHP.MSG')

/** Mnemonic -> [our seed field name, kind]. Order MUST match GEMAIN.C:838-869. */
const FIELDS = [
  ['TYPE',  'category',              'enum'],
  ['NAME',  'typeName',              'str'],
  ['SNAME', 'shipNameTemplate',      'str'],
  ['SHLD',  'maxShields',            'num'],
  ['PHSR',  'maxPhaser',             'num'],
  ['TORP',  'hasTorpedo',            'bool'],
  ['MISL',  'hasMissile',            'bool'],
  ['DECY',  'hasDecoy',              'bool'],
  ['JAMMR', 'hasJammer',             'bool'],
  ['ZIPPR', 'hasZipper',             'bool'],
  ['MINE',  'hasMine',               'bool'],
  ['ATTK',  'canAttackPlanet',       'bool'],
  ['CLOK',  'hasCloak',              'bool'],
  ['ACCL',  'maxAcceleration',       'num'],
  ['WARP',  'maxWarp',               'num'],
  ['TONS',  'maxTons',               'num'],
  ['PRIC',  'maxPrice',              'num'],
  ['PNTS',  'points',                'num'],
  ['SRNG',  'scanRange',             'num'],
  ['CATK',  'cybCanAttack',          'bool'],
  ['NATK',  'noClaim',               'num'],
  ['LATK',  'cybLowestClassAttacks', 'num'],
  ['MAKE',  'make',                  'num'],
  ['TOUGH', 'tough',                 'num'],
  ['DAMF',  'damageFactor',          'num'],
  ['RES2',  'reserved2',             'num'],
  ['RES3',  'reserved3',             'num'],
  ['HELP',  'helpMessage',           'str'],
]

const CATEGORY = { USER: 'PLAYER', CYBORG: 'CPU_COMBATIVE', DROID: 'CPU_DROID' }

/** The label before `: ` or `? ` is prose for the sysop; the tail is the value. */
function parseValue(raw, kind) {
  let v = raw
  const q = raw.lastIndexOf('? ')
  const c = raw.lastIndexOf(': ')
  const labelled = q !== -1 || c !== -1
  if (q !== -1) v = raw.slice(q + 2)
  else if (c !== -1) v = raw.slice(c + 2)
  if (kind === 'bool') return v.trim() === 'YES'
  if (kind === 'num') return v.trim() === '' ? 0 : Number(v.trim())
  // Bare string options carry NO sysop label, and their whitespace is data:
  // SNAME is a prefix the original concatenates a number onto, so "Cyberquad "
  // must keep its trailing space or the ship becomes "Cyberquad223".
  return labelled ? v.trim() : v
}

const text = readFileSync(SRC, 'utf8')
const classes = []
const skipped = []

for (const m of text.matchAll(/^S(\d{2})([A-Z0-9]+) \{([^}]*)\}/gm)) {
  const n = Number(m[1])
  let e = classes.find(c => c.classNumber === n)
  if (!e) classes.push((e = { classNumber: n, _order: [], _raw: {} }))
  e._order.push(m[2])
  e._raw[m[2]] = m[3]
}

const out = []
for (const c of classes.sort((a, b) => a.classNumber - b.classNumber)) {
  const expected = FIELDS.map(f => f[0]).join(',')
  const actual = c._order.join(',')
  if (actual !== expected) {
    throw new Error(
      `Class ${c.classNumber}: option order does not match GEMAIN.C read order.\n` +
      `  expected: ${expected}\n  actual:   ${actual}`
    )
  }
  const rec = { classNumber: c.classNumber }
  for (const [mn, field, kind] of FIELDS) rec[field] = parseValue(c._raw[mn], kind)
  if (rec.category === '<NONE>') { skipped.push(c.classNumber); continue }
  rec.category = CATEGORY[rec.category] ?? rec.category
  out.push(rec)
}

const num = n => (Math.abs(n) >= 10000 ? n.toLocaleString('en-US').replace(/,/g, '_') : String(n))

function emitTs(rows) {
  const head = `/**
 * Static ship class definitions -- GENERATED, DO NOT EDIT BY HAND.
 *
 * Contains material Copyright (C) 1988-1992 Michael B. Murdock, from Galactic
 * Empire release 3.2e, released by its author under GPL-2.0-or-later. This
 * port is AGPL-3.0-or-later; see NOTICE at the repository root.
 *
 * Regenerate with:  node tools/extract-ship-classes.mjs --ts
 *
 * Every value is read verbatim from the original distribution's ship
 * configuration table, reference/ge-upstream/mbmgemp/GE/REL/MBMGESHP.MSG,
 * which is the file the original game itself loaded at boot. No value here is
 * normalized, rounded or editorially adjusted; where a field looks unused for a
 * given class it is still canon's value, because the fields the game ignores
 * are decided by the code, not by the table.
 *
 * Classes whose TYPE is <NONE> are unused slots and are omitted: 10-20 and
 * 26-30. Slots 26-30 carry the stale leftover name "Cybertron Battle Cruiser"
 * and are NOT real classes. The active roster is 01-09, 21-25, 31-33 and 41.
 *
 * shipNameTemplate is canon's SNAME, a literal PREFIX. The original builds a
 * display name as sprintf("%s%u", SNAME, usrn*usrn + rnd%100) -- so "Cybertron "
 * becomes "Cybertron 223". Its trailing space is significant. USER classes have
 * an empty SNAME because players name their own ship.
 *
 * COLUMN MEANINGS (easy to transpose, and were, until 2026-09-01):
 *   noClaim               = canon NATK, the PREY's column -- how many combative
 *                           CPU ships may pursue this ship at once.
 *                           C: shipclass[victim].noclaim
 *   cybLowestClassAttacks = canon LATK, the HUNTER's column -- the lowest player
 *                           class this CPU pursues unprovoked.
 *                           C: shipclass[hunter].lowest_to_attk
 *   make                  = canon MAKE (tot_to_create). Read ONLY for CYBORG and
 *                           DROID classes; GEMAIN.C:2336-2338 skips USER classes,
 *                           so canon's 3 on player classes is inert.
 *
 * @see GEMAIN.C:835-875 -- the read loop that binds these fields by order
 * @see GEMAIN.C:2336-2358 -- the CYBORG/DROID-only spawn loop
 * @see reference/ge-upstream/PROVENANCE.md -- provenance and source precedence
 */

export interface ShipClassSeed {
  classNumber: number;
  typeName: string;
  shipNameTemplate: string;
  category: "PLAYER" | "CPU_COMBATIVE" | "CPU_DROID";
  maxShields: number;
  maxPhaser: number;
  hasTorpedo: boolean;
  hasMissile: boolean;
  hasDecoy: boolean;
  hasJammer: boolean;
  hasZipper: boolean;
  hasMine: boolean;
  canAttackPlanet: boolean;
  hasCloak: boolean;
  maxAcceleration: number;
  maxWarp: number;
  maxTons: number;
  maxPrice: bigint;
  scanRange: number;
  points: number;
  damageFactor: number;
  cybCanAttack: boolean;
  cybLowestClassAttacks: number;
  noClaim: number;
  make: number;
  tough: number;
}

export const SHIP_CLASSES: readonly ShipClassSeed[] = [
`
  let body = ''
  let section = null
  for (const r of rows) {
    const s = r.category
    if (s !== section) {
      const title = s === 'PLAYER' ? 'Player ships (USER)'
        : s === 'CPU_COMBATIVE' ? 'Cybertron / Sarten combat ships (CYBORG)'
        : 'Droids (DROID)'
      body += `\n  // ${'\u2500'.repeat(3)} ${title} ${'\u2500'.repeat(Math.max(3, 60 - title.length))}\n`
      section = s
    }
    body += '  {\n'
    body += `    classNumber: ${r.classNumber},\n`
    body += `    typeName: ${JSON.stringify(r.typeName)},\n`
    body += `    shipNameTemplate: ${JSON.stringify(r.shipNameTemplate)},\n`
    body += `    category: ${JSON.stringify(r.category)},\n`
    for (const [, f, k] of FIELDS) {
      if (['category','typeName','shipNameTemplate','helpMessage','reserved2','reserved3'].includes(f)) continue
      const v = r[f]
      const lit = f === 'maxPrice' ? num(v) + 'n' : k === 'bool' ? String(v) : num(v)
      body += `    ${f}: ${lit},\n`
    }
    body += '  },\n'
  }
  return head + body + '] as const;\n'
}

if (process.argv.includes('--ts')) {
  const { writeFileSync } = await import('node:fs')
  const dest = resolve(HERE, '../backend/prisma/seed/ship-classes.ts')
  writeFileSync(dest, emitTs(out))
  console.error(`wrote ${dest} (${out.length} classes)`)
} else if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2))
} else {
  console.log(`${out.length} active classes (skipped <NONE> slots: ${skipped.join(', ')})\n`)
  const cols = ['classNumber', 'typeName', 'category', 'maxShields', 'maxPhaser', 'maxAcceleration',
                'maxWarp', 'maxTons', 'maxPrice', 'points', 'scanRange', 'cybCanAttack',
                'noClaim', 'cybLowestClassAttacks', 'make', 'tough', 'damageFactor']
  console.log(cols.map(c => c.slice(0, 12).padEnd(12)).join(''))
  for (const r of out) console.log(cols.map(c => String(r[c]).slice(0, 12).padEnd(12)).join(''))
}
