/**
 * Coverage recount — branches of COVERABLE, not raw branches.
 *
 *   npx jest --coverage --coverageReporters=json
 *   node tools/classify-coverage.mjs
 *
 * Istanbul's raw branch percentage counts every `??` fallback, every catch-block
 * error ternary and every defensive early return in its denominator. Chasing a
 * raw 90% therefore means writing tests for display fallbacks to buy percentage
 * points, which is the exact behaviour docs/TEST_STRATEGY.md exists to stop.
 *
 * This script reads each uncovered branch's source line and sorts it into one of
 * four buckets. Three are deliberate exclusions named in that document; the
 * fourth, `real`, is the queue.
 *
 * It exists because the classification was done by hand twice and came out
 * different both times — first too crude (`??` and `catch` only, overstating the
 * real count by about a third), then still missing the `err instanceof Error`
 * ternary and the `x === null` guard. A number nobody can reproduce is not a
 * measurement. Change the rules here rather than re-deriving them, so a later
 * recount is comparable with this one.
 *
 * @see docs/TEST_STRATEGY.md
 */
import { readFileSync } from 'node:fs';
const cov = JSON.parse(readFileSync('coverage/coverage-final.json', 'utf8'));
const src = new Map();
function line(f, n) {
  if (!src.has(f)) src.set(f, readFileSync(f, 'utf8').split('\n'));
  return (src.get(f)[n - 1] ?? '').trim();
}
const CATS = ['display', 'defensive', 'optdep', 'real'];
function classify(t) {
  if (t.includes('??') || t.includes('?.')) return 'display';
  if (/^\}?\s*catch/.test(t) || /catch\s*\(/.test(t)) return 'display';
  // `const stack = err instanceof Error ? err.stack : String(err)` and kin —
  // the error-logging idiom inside a catch block, not a game decision.
  if (/instanceof Error\s*\?/.test(t)) return 'display';
  if (/^if\s*\(!.*\)\s*(return|continue|throw)/.test(t)) return 'defensive';
  if (/^if\s*\(!\w[\w.]*\)\s*\{?$/.test(t)) return 'defensive';
  // `if (owner === null) return` — guarding a state the caller already ensured.
  if (/^if\s*\([\w.]+\s*===\s*(null|undefined)\)\s*(return|continue|throw)/.test(t)) return 'defensive';
  if (/^if\s*\(this\.\w+\)/.test(t)) return 'optdep';
  return 'real';
}
const totals = { total: 0, covered: 0, display: 0, defensive: 0, optdep: 0, real: 0 };
const perFile = [];
for (const [file, d] of Object.entries(cov)) {
  if (!file.includes('/src/')) continue;
  // Deliberate exclusions from docs/TEST_STRATEGY.md: debug controllers are
  // covered by Playwright, not Jest, and config modules are pinned by the
  // balance specs that re-read the original .MSG files.
  if (/\.debug\.controller\.ts$/.test(file)) continue;
  if (/\.config\.ts$/.test(file)) continue;
  let total = 0, covered = 0;
  const c = { display: 0, defensive: 0, optdep: 0, real: 0 };
  for (const [id, counts] of Object.entries(d.b)) {
    const loc = d.branchMap[id];
    for (let i = 0; i < counts.length; i++) {
      total++;
      if (counts[i] > 0) { covered++; continue; }
      const ln = (loc.locations?.[i]?.start?.line) ?? loc.loc.start.line;
      c[classify(line(file, ln))]++;
    }
  }
  if (!total) continue;
  totals.total += total; totals.covered += covered;
  for (const k of CATS.slice(0, 3)) totals[k] += c[k];
  totals.real += c.real;
  const excl = c.display + c.defensive + c.optdep;
  perFile.push({
    file: file.replace(/^.*\/src\//, ''),
    raw: (100 * covered / total),
    coverable: total - excl > 0 ? (100 * (total - excl - c.real) / (total - excl)) : 100,
    real: c.real, total,
  });
}
const excl = totals.display + totals.defensive + totals.optdep;
console.log(JSON.stringify({
  raw: (100 * totals.covered / totals.total).toFixed(1),
  coverable: (100 * (totals.total - excl - totals.real) / (totals.total - excl)).toFixed(1),
  // The raw figure the suite would report if every REAL decision were covered.
  ceiling: (100 * (totals.total - totals.real) / totals.total).toFixed(1),
  uncovered: totals.total - totals.covered,
  display: totals.display, defensive: totals.defensive, optdep: totals.optdep, real: totals.real,
}, null, 2));
const WATCH = ['droid/droid-tick.service.ts', 'physics/physics-tick.service.ts', 'planet/planet-economy.service.ts',
  'gateway/game.gateway.ts', 'cybertron/cybertron-tick.service.ts', 'combat/combat-tick.service.ts',
  'planet/planet-state.service.ts', 'commands/handlers/scan.handler.ts', 'commands/handlers/transfer.handler.ts',
  'commands/handlers/new-ship.handler.ts', 'commands/handlers/report.handler.ts', 'combat/firehp.ts'];
console.log('\nfile | raw | coverable | real left');
for (const w of WATCH) {
  const f = perFile.find((x) => x.file.endsWith(w));
  if (f) console.log(`${w} | ${f.raw.toFixed(1)} | ${f.coverable.toFixed(1)} | ${f.real}`);
}
console.log('\nTop 10 by real branches left:');
for (const f of perFile.sort((a, b) => b.real - a.real).slice(0, 10)) {
  console.log(`${f.file} | raw ${f.raw.toFixed(1)} | coverable ${f.coverable.toFixed(1)} | real ${f.real}`);
}
