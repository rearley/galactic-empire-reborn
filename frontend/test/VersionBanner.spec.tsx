import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersionBanner, isStaleBuild } from '../src/components/VersionBanner';

/**
 * The "you are running an old build" banner.
 *
 * Deploys are hands-off and the socket reconnects by itself, so the page keeps
 * its original bundle across a restart: the owner had to hard-refresh to pick
 * up v0.27.7, and until they did, the header claimed a version the server was
 * no longer running. A stale client is not only cosmetic — it can be speaking
 * an older event contract than the server it just reconnected to.
 *
 * Deliberately NOT an automatic reload. The reconnect lands exactly when a
 * player is most likely to be typing a command to re-orient themselves, and
 * pulling the page out from under them at that moment is the most disruptive
 * possible timing. @see docs/DECISIONS.md 2026-09-20
 */
describe('isStaleBuild', () => {
  it('is stale when the server reports a different build', () => {
    expect(isStaleBuild('v0.27.7 · 3895292', 'v0.27.8 · 3fae5a4')).toBe(true);
  });

  it('is not stale when they agree', () => {
    expect(isStaleBuild('v0.27.8 · 3fae5a4', 'v0.27.8 · 3fae5a4')).toBe(false);
  });

  it('never nags in development, where neither side has a real build', () => {
    // `dev` is what version.ts yields with no GIT_SHA, and `v?` with no
    // VITE_APP_VERSION. A dev client rebuilds on save; telling it to reload on
    // every restart would be noise, and worse, it would train the reflex to
    // ignore the banner that matters in production.
    expect(isStaleBuild('v? · dev', 'v0.27.8 · 3fae5a4')).toBe(false);
    expect(isStaleBuild('v0.27.8 · 3fae5a4', 'v? · dev')).toBe(false);
    expect(isStaleBuild('v? · dev', 'v? · dev')).toBe(false);
  });

  it('says nothing until the server version is actually known', () => {
    // A failed or in-flight /public/stats must not be read as a mismatch.
    expect(isStaleBuild('v0.27.8 · 3fae5a4', null)).toBe(false);
    expect(isStaleBuild('v0.27.8 · 3fae5a4', '')).toBe(false);
  });
});

describe('VersionBanner', () => {
  const props = (over = {}) => ({
    serverVersion: 'v0.27.8 · 3fae5a4',
    onReload: vi.fn(),
    onDismiss: vi.fn(),
    ...over,
  });

  it('renders nothing when there is no newer build', () => {
    const { container } = render(
      <VersionBanner serverVersion={null} onReload={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('names the version on offer, so the reload is not a leap of faith', () => {
    render(<VersionBanner {...props()} />);
    expect(screen.getByTestId('version-banner').textContent).toContain('v0.27.8');
  });

  it('reloads on demand rather than on arrival', async () => {
    const onReload = vi.fn();
    render(<VersionBanner {...props({ onReload })} />);
    await userEvent.click(screen.getByTestId('version-reload'));
    expect(onReload).toHaveBeenCalled();
  });

  it('can be dismissed by a player who is mid-something', async () => {
    const onDismiss = vi.fn();
    render(<VersionBanner {...props({ onDismiss })} />);
    await userEvent.click(screen.getByTestId('version-dismiss'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('is a polite live region, not an assertive one', () => {
    // The deploy countdown interrupts because it is time-critical. This is not:
    // nothing is lost by hearing about it at the next natural pause.
    render(<VersionBanner {...props()} />);
    const banner = screen.getByTestId('version-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });
});
