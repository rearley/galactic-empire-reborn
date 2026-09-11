import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One declaration per wire contract, imported by both sides.
 *
 * Phase 1 of the restructure deleted `frontend/src/types/contracts.ts` for
 * exactly this reason, and found five real defects the duplicate declarations
 * had been hiding — including a payload declaring eleven fields when four are
 * sent. A surviving instance lived one level down: `hooks/useScanRender.ts`
 * re-declared `ScanCell`, `SidePanelRow` and `ScanRenderEvent`, and
 * `hooks/useScanMap.ts` bridged the two copies with `event.cells as ScanCell[]`.
 * The cast is what made it a hazard rather than tidy duplication: `as` disables
 * the one check that would notice the shapes drifting apart.
 *
 * This guard reads the wire package's own exports, so a contract added there
 * is covered the moment it lands.
 */
const WIRE_SRC = join(__dirname, '../../packages/wire/src');
const FRONTEND_SRC = join(__dirname, '../src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
}

function exportedTypeNames(dir: string): string[] {
  const names = new Set<string>();
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^export\s+(?:interface|type)\s+(\w+)/gm)) {
      names.add(m[1]);
    }
  }
  return [...names];
}

describe('frontend does not re-declare a @ge/wire contract', () => {
  const wireTypes = exportedTypeNames(WIRE_SRC);

  it('finds the wire contracts to check against', () => {
    expect(wireTypes).toContain('ScanCell');
    expect(wireTypes.length).toBeGreaterThan(5);
  });

  it('declares none of them locally', () => {
    const offenders: string[] = [];
    for (const file of walk(FRONTEND_SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/^export\s+(?:interface|type)\s+(\w+)/gm)) {
        if (wireTypes.includes(m[1])) offenders.push(`${file.replace(FRONTEND_SRC, 'src')}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
