import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The deployment config is the last line of defence for the cheat endpoints,
 * and it was working against us: `frontend/nginx.conf` explicitly proxied
 * `/debug/` to the backend, so the only thing between the public web server and
 * "teleport any ship, set any captain's credits" was `NODE_ENV: production`
 * being present in docker-compose.yml. One missing environment variable.
 *
 * These assertions are deliberately about the shipped files rather than the
 * code: the code gate is tested elsewhere, and this is the layer that a routine
 * infrastructure edit could reopen without anyone noticing.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

describe('deployment does not expose the debug endpoints', () => {
  it('the production web server does not proxy /debug', () => {
    const nginx = read('frontend/nginx.conf');
    expect(nginx).not.toMatch(/location\s+\/debug/);
    expect(nginx).not.toMatch(/proxy_pass[^;]*\/debug/);
  });

  it('the production web server still proxies what the game needs', () => {
    const nginx = read('frontend/nginx.conf');
    expect(nginx).toMatch(/location\s+\/auth\//);
    expect(nginx).toMatch(/location\s+\/socket\.io\//);
  });

  it('compose runs the backend in production mode', () => {
    expect(read('docker-compose.yml')).toMatch(/NODE_ENV:\s*production/);
  });

  it('compose never switches the cheat endpoints on', () => {
    expect(read('docker-compose.yml')).not.toMatch(/GE_DEBUG_ENDPOINTS/);
  });

  it('the example environment does not switch them on either', () => {
    expect(read('backend/.env.example')).not.toMatch(/^GE_DEBUG_ENDPOINTS\s*=\s*(1|true|yes|on)/mi);
  });
});
