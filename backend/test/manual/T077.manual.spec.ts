/**
 * T077 — Source fidelity audit: finding disposition summary (manual).
 *
 * Verifies that the audit findings doc exists and all findings are
 * marked as fixed or n/a (no remaining pending items).
 *
 * Run with: npm run test:manual
 *
 * This test encodes the final QA gate for feature 020:
 *  - All F-001..F-008 findings have been triaged.
 *  - No finding remains in disposition=pending.
 */

import * as fs from 'fs';
import * as path from 'path';

const FINDINGS_PATH = path.resolve(__dirname, '../../../docs/020-audit-findings.md');

describe('T077 — source fidelity audit disposition gate', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(FINDINGS_PATH, 'utf-8');
  });

  it('findings file exists', () => {
    expect(fs.existsSync(FINDINGS_PATH)).toBe(true);
  });

  it('all 8 findings (F-001..F-008) are present', () => {
    for (let i = 1; i <= 8; i++) {
      expect(content).toContain(`F-00${i}`);
    }
  });

  it('no finding has disposition=pending', () => {
    const pendingMatches = content.match(/\|\s*pending\s*\|/g);
    expect(pendingMatches).toBeNull();
  });

  it('GEMAIN_GAMEPLAY_PINS is exported from constants.ts', () => {
    const constantsPath = path.resolve(__dirname, '../../src/game/constants.ts');
    const constantsContent = fs.readFileSync(constantsPath, 'utf-8');
    expect(constantsContent).toContain('GEMAIN_GAMEPLAY_PINS');
  });

  it('GalaxyWormholeView is exported from galaxy.types.ts', () => {
    const typesPath = path.resolve(__dirname, '../../src/game/galaxy/galaxy.types.ts');
    const typesContent = fs.readFileSync(typesPath, 'utf-8');
    expect(typesContent).toContain('GalaxyWormholeView');
  });
});
