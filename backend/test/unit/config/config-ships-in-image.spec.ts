import { readFileSync } from 'fs';
import { join } from 'path';
import { candidateConfigPaths, DEFAULT_CONFIG_PATH } from '../../../src/game/config/game-config';

/**
 * The path arithmetic was fixed (see config-path.spec.ts). The Dockerfile then
 * reintroduced the same failure one layer up: it never copied `config/` into
 * the runtime image, so the file the resolver correctly looks for was simply
 * not there.
 *
 * A missing file is a LEGITIMATE state that falls back to canon defaults, so
 * this fails silently. `config/game.config.json` currently carries
 * `UNIVMAX: 100` against a canon default of 300 — a containerised deployment
 * would have generated a 601x601 galaxy instead of 201x201, nine times the
 * area, with scan ranges unchanged because they are absolute.
 *
 * These read the Dockerfile rather than trusting it, for the same reason the
 * migration tests read migration.sql: a build instruction that silently omits
 * a file is exactly what does not show up in a passing suite.
 */
const DOCKERFILE = readFileSync(join(__dirname, '../../../Dockerfile'), 'utf8');

describe('the runtime image ships the sysop config', () => {
  it('copies config/ into the runtime stage', () => {
    // Split on the second FROM: only the runtime stage's COPYs reach the image.
    const stages = DOCKERFILE.split(/^FROM /m);
    const runtime = stages[stages.length - 1];
    // Any number of COPY flags — `--from` and `--chown` both appear now that
    // the runtime image drops to the `node` user.
    expect(runtime).toMatch(/COPY\s+(--\S+\s+)*\S*config\S*\s+\.\/config/);
  });

  it('lands it where the resolver actually looks, given the image WORKDIR', () => {
    // Dockerfile sets WORKDIR /app and runs dist/src/main, so __dirname at
    // runtime is /app/dist/src/game/config.
    expect(DOCKERFILE).toMatch(/WORKDIR\s+\/app/);
    const paths = candidateConfigPaths('/app/dist/src/game/config');
    expect(paths).toContain(`/app/${DEFAULT_CONFIG_PATH}`);
  });
});
