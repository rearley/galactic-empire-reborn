import { resolveGameConfig } from '../../../src/game/config/game-config';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * A missing config file is a legitimate state that falls back to canon
 * defaults. That is the right behaviour and it is also why two separate bugs
 * hid here: first the path arithmetic was wrong from a compiled tree, then the
 * Dockerfile did not ship the file at all. Both times the server ran on
 * defaults and said nothing.
 *
 * The fix for "silent" is not to make a missing file fatal — a fresh checkout
 * must still work with no setup. It is to make the ANSWER visible: which file
 * was used, or that none was. So the result carries it and boot logs it.
 */
describe('the resolved config file is discoverable', () => {
  it('reports the file it actually read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ge-cfg-'));
    const file = join(dir, 'game.config.json');
    writeFileSync(file, JSON.stringify({ world: { UNIVMAX: 100 } }));

    const result = resolveGameConfig({ path: file, env: {} });

    expect(result.configPath).toBe(file);
    expect(result.UNIVMAX).toBe(100);
  });

  it('reports null when no file was found, rather than looking identical', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'ge-cfg-')), 'absent.json');

    const result = resolveGameConfig({ path: missing, env: {} });

    expect(result.configPath).toBeNull();
  });

  it('still yields a complete, playable configuration with no file', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'ge-cfg-')), 'absent.json');
    const result = resolveGameConfig({ path: missing, env: {} });
    // Canon's shipped default, MBMGEMSG.MSG — not our deployed 100.
    expect(result.UNIVMAX).toBe(300);
  });
});
