import { candidateConfigPaths } from '../../../src/game/config/game-config';

/**
 * The sysop config file was silently ignored in every BUILT deployment.
 *
 * The path was `path.resolve(__dirname, '../../..', 'config/game.config.json')`.
 * From source that lands on `backend/config/game.config.json` and works. From
 * the compiled tree `__dirname` is `backend/dist/src/game/config`, so it
 * resolves to `backend/dist/config/game.config.json` — which does not exist.
 * `fs.existsSync` returned false and the loader fell back to defaults without
 * a word.
 *
 * Everything ran on hardcoded defaults: a PFIRDST tuned to 3 stayed at 1, and
 * an entire playtest was measured against a change that was never in force.
 * Tests never caught it because ts-jest runs from source, where the old path
 * happens to be correct — so "verified in a test" and "in force on the server"
 * were different things.
 */
describe('candidateConfigPaths', () => {
  it('looks beside a source tree', () => {
    const paths = candidateConfigPaths('/app/backend/src/game/config');
    expect(paths).toContain('/app/backend/config/game.config.json');
  });

  it('ALSO looks beside a compiled tree, which is where it failed', () => {
    const paths = candidateConfigPaths('/app/backend/dist/src/game/config');
    expect(paths).toContain('/app/backend/config/game.config.json');
  });

  it('offers the dist-local path too, for a deployment that ships one there', () => {
    const paths = candidateConfigPaths('/app/backend/dist/src/game/config');
    expect(paths).toContain('/app/backend/dist/config/game.config.json');
  });

  it('returns candidates in a stable order with no duplicates', () => {
    const paths = candidateConfigPaths('/app/backend/dist/src/game/config');
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.length).toBeGreaterThan(1);
  });
});

/**
 * A deployment needs ONE predictable answer to "where is the config?", and it
 * needs to be settable without rebuilding the image — Plesk and Docker mount a
 * volume and inject environment, they do not rebuild to retune a galaxy.
 *
 * The four candidate paths are correct and stay: they are what makes source
 * runs, ts-jest runs and compiled runs all work without setup. GE_CONFIG_PATH
 * sits in FRONT of them so a deployment can be explicit instead of relying on
 * path arithmetic it cannot see.
 */
describe('GE_CONFIG_PATH', () => {
  it('takes priority over every derived path', () => {
    const paths = candidateConfigPaths('/app/dist/src/game/config', {
      GE_CONFIG_PATH: '/etc/ge/game.config.json',
    });
    expect(paths[0]).toBe('/etc/ge/game.config.json');
  });

  it('does not displace the derived paths — they remain as fallbacks', () => {
    const paths = candidateConfigPaths('/app/dist/src/game/config', {
      GE_CONFIG_PATH: '/etc/ge/game.config.json',
    });
    expect(paths).toContain('/app/config/game.config.json');
    expect(paths.length).toBeGreaterThan(1);
  });

  it('is ignored when unset or empty, so nothing changes for local runs', () => {
    const withEmpty = candidateConfigPaths('/app/dist/src/game/config', { GE_CONFIG_PATH: '' });
    const without = candidateConfigPaths('/app/dist/src/game/config', {});
    expect(withEmpty).toEqual(without);
    expect(without[0]).toBe('/app/config/game.config.json');
  });
});
