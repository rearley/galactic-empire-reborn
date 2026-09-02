#!/usr/bin/env node
/**
 * Extract the per-item tables from the original MBMGEMSG.MSG.
 *
 * GEMAIN.C:550-570 walks NUMITEMS and reads five parallel option families:
 *
 *   ITMPL<nn>  maxpl[i]     -- maximum stock of the item on one planet
 *   ITMWT<nn>  weight[i]    -- cargo weight of ONE HUNDRED units
 *   ITMVAL<nn> value[i]     -- score value per unit
 *   ITMMH<nn>  manhours[i]  -- units produced per 10K man-weeks
 *   ITMPR<nn>  baseprice[i] -- base price
 *
 * ITMPR has NO blocks in the shipped file: baseprice was added later
 * (GEMAIN.C:569) than this .MSG, so there is no canon base price for any item
 * and the port's BASEPRICE table cannot be recovered from here. That is a real
 * gap, not a parse failure, and the script reports it rather than inventing one.
 *
 * NOTE the weight scale. The option is "Weight of 100 Men", so per-unit tons is
 * the value / 100. The port's ITEM_TONS is per-unit and was right for 13 of 14
 * items; gold read 0.5 where canon's 200-per-100 gives 2.
 *
 * Usage: node tools/extract-item-tables.mjs [--json]
 *
 * @see reference/ge-upstream/PROVENANCE.md
 * @see GEMAIN.C:550-570
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../reference/ge-upstream/mbmgemp/GE/MSG/MBMGEMSG.MSG')
const NUMITEMS = 14

const text = readFileSync(SRC, 'utf8')

/** Pull ITM<family><nn> defaults, in index order, for the first NUMITEMS slots. */
function family(prefix) {
  const out = []
  for (let i = 1; i <= NUMITEMS; i++) {
    const tag = `${prefix}${String(i).padStart(2, '0')}`
    const m = new RegExp(`^${tag} \\{([^}]*)\\}`, 'm').exec(text)
    if (!m) return null
    const inner = m[1]
    const c = inner.lastIndexOf(': ')
    out.push(Number((c !== -1 ? inner.slice(c + 2) : inner).trim()))
  }
  return out
}

const maxpl = family('ITMPL')
const weight100 = family('ITMWT')
const value = family('ITMVAL')
const manhours = family('ITMMH')
const baseprice = family('ITMPR')

const tables = {
  MAXPL: maxpl,
  ITEM_TONS: weight100 ? weight100.map((w) => w / 100) : null,
  ITEM_VALUE: value,
  MANHOURS: manhours,
  BASEPRICE: baseprice, // expected null — see header
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(tables, null, 2))
} else {
  for (const [name, rows] of Object.entries(tables)) {
    if (!rows) {
      console.log(`${name}: NOT PRESENT in MBMGEMSG.MSG — no canon value`)
      continue
    }
    console.log(`${name}: [${rows.join(', ')}]`)
  }
}
