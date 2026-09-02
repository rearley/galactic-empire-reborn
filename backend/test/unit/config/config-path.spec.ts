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
