import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseSupportUrl, supportUrl } from '../src/support';

afterEach(() => vi.unstubAllEnvs());

describe('parseSupportUrl', () => {
  it('returns null when nothing is configured', () => {
    // The default for every fork of a public repo. No variable set, no button,
    // no dead link — and crucially, not this repo's sponsor page either.
    expect(parseSupportUrl(undefined)).toBeNull();
    expect(parseSupportUrl('')).toBeNull();
    expect(parseSupportUrl('   ')).toBeNull();
  });

  it('accepts an https url', () => {
    expect(parseSupportUrl('https://github.com/sponsors/someone')).toBe(
      'https://github.com/sponsors/someone',
    );
  });

  it('trims surrounding whitespace', () => {
    // A build arg travels through YAML and a shell before it reaches Vite.
    expect(parseSupportUrl('  https://ko-fi.com/someone \n')).toBe('https://ko-fi.com/someone');
  });

  it('rejects anything that is not https', () => {
    // This value is rendered straight into an href. It arrives from a build
    // arg rather than a user, so this is a guardrail and not a security
    // boundary — but a javascript: href is never what anyone configured.
    expect(parseSupportUrl('javascript:alert(1)')).toBeNull();
    expect(parseSupportUrl('http://github.com/sponsors/someone')).toBeNull();
    expect(parseSupportUrl('github.com/sponsors/someone')).toBeNull();
  });
});

describe('supportUrl', () => {
  it('reads the configured value at call time', () => {
    vi.stubEnv('VITE_DONATE_URL', 'https://github.com/sponsors/someone');
    expect(supportUrl()).toBe('https://github.com/sponsors/someone');
  });

  it('is null when the build set nothing', () => {
    vi.stubEnv('VITE_DONATE_URL', '');
    expect(supportUrl()).toBeNull();
  });
});
