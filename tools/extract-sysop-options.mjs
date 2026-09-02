#!/usr/bin/env node
/**
 * Extract the original sysop option defaults and clamp bounds from MBMGEMSG.MSG.
 *
 * Option blocks look like:
 *
 *     MAXPLRS {The maximum players in the game at once: 30} N 1 256
 *
 * The value after the last `: ` inside the braces is the DEFAULT the original
 * shipped; the trailing letter is the type (N numeric, B boolean, S string,
 * C char, G filename) and, for N, the declared min and max.
 *
 * This existing file is why `SysopOption.default` is recoverable at all. The
 * port had assumed otherwise -- game-config.ts once stated that the values
 * "are not part of the reference source, so there is nothing to recover" --
 * and consequently seeded ~35 options with the numopt() clamp ceiling or floor
 * instead of Murdock's shipped value.
 *
 * NOTE on precedence: where the .MSG's declared range disagrees with the
 * numopt()/lngopt() arguments in the C, the C WINS. The C is what actually
 * clamped the value at boot. This script reports the .MSG range for reference;
 * SYSOP_OPTIONS keeps the C bounds.
 *
 * Usage: node tools/extract-sysop-options.mjs [--json] [NAME...]
 *
 * @see reference/ge-upstream/PROVENANCE.md
 * @see GEMAIN.C:459-524
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../reference/ge-upstream/mbmgemp/GE/MSG/MBMGEMSG.MSG')

const text = readFileSync(SRC, 'utf8')
const out = []
const re = /^([A-Z][A-Z0-9]*) \{([^}]*)\}(?:[ \t]+([A-Z]))?(?:[ \t]+(-?\d+)[ \t]+(-?\d+))?[ \t]*$/gm

for (const m of text.matchAll(re)) {
  const [, name, inner, kind, lo, hi] = m
  const c = inner.lastIndexOf(': ')
  const q = inner.lastIndexOf('? ')
  let raw = inner
  if (q > c) raw = inner.slice(q + 2)
  else if (c !== -1) raw = inner.slice(c + 2)
  raw = raw.trim()
  const rec = { name, kind: kind ?? '?', raw, label: inner }
  if (kind === 'N' && lo !== undefined) {
    rec.default = Number(raw)
    rec.msgMin = Number(lo)
    rec.msgMax = Number(hi)
  } else if (kind === 'B') {
    rec.default = raw === 'YES'
  } else {
    rec.default = raw
  }
  out.push(rec)
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const rows = wanted.length ? out.filter((r) => wanted.includes(r.name)) : out

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  for (const r of rows) {
    const range = r.msgMin !== undefined ? `  [${r.msgMin}..${r.msgMax}]` : ''
    console.log(`${r.name.padEnd(12)} ${r.kind}  ${String(r.default).padEnd(12)}${range}`)
  }
  console.log(`\n${rows.length} options`)
}
