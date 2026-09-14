import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const dockerfile = readFileSync(join(REPO, 'frontend/Dockerfile'), 'utf8');
const ci = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');

/**
 * The support link is configuration, not source.
 *
 * This repo is public and AGPL, so anyone may run their own galaxy from it. A
 * sponsor URL written into the source would ride along into every fork, and a
 * stranger's players would fund this server rather than the one they play on —
 * silently, because the button looks identical either way. Keeping the value in
 * a repository variable makes "unset" the default that a fork inherits.
 *
 * @see frontend/src/support.ts
 */
describe('the support link is configured, never hardcoded', () => {
  it('reaches the bundle through a build arg', () => {
    // Vite only exposes VITE_-prefixed vars, and only at build time.
    expect(dockerfile).toMatch(/^ARG DONATE_URL=""$/m);
    expect(dockerfile).toMatch(/^ENV VITE_DONATE_URL=\$DONATE_URL$/m);
  });

  it('takes its value from a repository variable', () => {
    expect(ci).toMatch(/DONATE_URL=\$\{\{ vars\.DONATE_URL \}\}/);
  });

  it('names no sponsor page anywhere in the tree', () => {
    // The real protection. A URL in a component, a default in the Dockerfile,
    // or a literal in the workflow would each defeat the variable, and each
    // looks perfectly reasonable in isolation.
    const sponsorLink = /https:\/\/(github\.com\/sponsors|ko-fi\.com|www\.paypal\.|buymeacoffee\.com)/;
    expect(dockerfile).not.toMatch(sponsorLink);
    expect(ci).not.toMatch(sponsorLink);
    expect(readFileSync(join(REPO, 'frontend/src/routes/Landing.tsx'), 'utf8')).not.toMatch(sponsorLink);
    expect(readFileSync(join(REPO, 'frontend/src/support.ts'), 'utf8')).not.toMatch(sponsorLink);
  });
});
