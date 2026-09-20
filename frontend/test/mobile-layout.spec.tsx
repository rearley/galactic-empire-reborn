import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('../src/auth/tokenStore', () => ({
  getToken: vi.fn(() => 'test-jwt-token'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

vi.mock('../src/socket/socketClient', () => ({
  socket: { connected: false, on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  connectSocket: vi.fn(),
  sendCommand: vi.fn(),
  onCommandResult: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
  onSocketAuthFailed: vi.fn(),
}));

vi.mock('../src/socket/useSocket', () => ({
  useSocket: vi.fn(() => ({
    status: 'connected' as const,
    lastResult: null,
    send: vi.fn(),
    localShipId: 'ship-1',
    onboardingPrompt: null,
    reconnect: vi.fn(),
    emitPromptReply: vi.fn(),
  })),
}));

import { App } from '../src/App';
import { socket } from '../src/socket/socketClient';

/**
 * Push an `fkeys.snapshot` through the mocked socket, the way the server does
 * on board and after every `fset`. Without it the harness has no bindings and
 * "no chip bar" would pass for the wrong reason.
 */
function bindFkeys(bindings: string[]): void {
  const on = socket.on as unknown as { mock: { calls: [string, (e: unknown) => void][] } };
  const handlers = on.mock.calls.filter(([event]) => event === 'fkeys.snapshot');
  expect(handlers.length).toBeGreaterThan(0);
  act(() => { for (const [, fn] of handlers) fn({ fkeys: bindings }); });
}

/**
 * The phone layout.
 *
 * The terminal is three columns: the log takes what is left after a 320px scan
 * column and a 192px roster, both marked `shrink-0`. On a 390px phone those two
 * alone overflow the screen, so the log — the thing you actually read — was
 * squeezed to nothing and pushed off to the left. The owner reported having to
 * turn the phone sideways to see it at all.
 *
 * Narrow means ONE column: the command line first, because iOS puts the
 * keyboard over the bottom ~40% of the screen, then the log, then the panels
 * folded away. Nothing here changes the desktop terminal.
 */
function setViewport(narrow: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: narrow && query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  // @ts-expect-error — restore the environment's own absence of matchMedia
  delete window.matchMedia;
});

describe('on a phone', () => {
  beforeEach(() => setViewport(true));

  it('gives the event log the screen instead of the leftovers', () => {
    const { container } = render(<App />);
    expect(screen.getByTestId('event-log')).toBeInTheDocument();
    // The 320px scan column and the 192px roster are what crowded it out.
    // Neither may exist at this width, at any depth.
    expect(container.querySelectorAll('[class*="w-80"], [class*="w-48"]')).toHaveLength(0);
  });

  it('puts the command line above the log, where the keyboard cannot cover it', () => {
    render(<App />);
    const input = screen.getByTestId('command-input');
    const log = screen.getByTestId('event-log');
    // eslint-disable-next-line no-bitwise
    const inputFirst = log.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_PRECEDING;
    expect(Boolean(inputFirst)).toBe(true);
  });

  it('folds the scan and the roster away rather than stacking them', () => {
    render(<App />);
    const scan = screen.getByTestId('panel-scan');
    const roster = screen.getByTestId('panel-players');
    expect(scan.tagName).toBe('DETAILS');
    expect(roster.tagName).toBe('DETAILS');
    expect((scan as HTMLDetailsElement).open).toBe(false);
    expect((roster as HTMLDetailsElement).open).toBe(false);
  });

  it('offers the bound shortcuts as one tap, between the command line and the log', () => {
    render(<App />);
    bindFkeys(['pha 0', 'shi up']);
    const bar = screen.getByTestId('fkey-bar');
    expect(screen.getByTestId('fkey-chip-f1')).toHaveTextContent('f1 pha 0');
    const input = screen.getByTestId('command-input');
    const log = screen.getByTestId('event-log');
    expect(input.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(log.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('keeps the f-key legend, because the shortcuts are TYPED, not pressed', () => {
    // `fset f1 pha 0 0` then `f1` — a browser cannot claim the real F-keys
    // (game/commands/fkeys.ts), so these are commands you type, and typing
    // `f1` rather than `pha 0 0` is worth MORE on a touch keyboard.
    render(<App />);
    expect(screen.getByTestId('fkey-map')).toBeInTheDocument();
  });
});

describe('on a desktop', () => {
  beforeEach(() => setViewport(false));

  it('keeps the three-column terminal', () => {
    render(<App />);
    expect(screen.getByTestId('event-log')).toBeInTheDocument();
    expect(screen.getByTestId('scan-map')).toBeInTheDocument();
    expect(screen.getByTestId('player-list-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-scan')).not.toBeInTheDocument();
  });

  it('keeps the f-key legend', () => {
    render(<App />);
    expect(screen.getByTestId('fkey-map')).toBeInTheDocument();
  });

  it('gets no tap-bar even with slots bound — the side-panel legend is enough', () => {
    render(<App />);
    bindFkeys(['pha 0', 'shi up']);
    expect(screen.queryByTestId('fkey-bar')).not.toBeInTheDocument();
    // ...and the legend still lists them.
    expect(screen.getByTestId('fkey-map')).toHaveTextContent('pha 0');
  });

  it('is the default when the browser cannot be asked', () => {
    // @ts-expect-error — some environments have no matchMedia at all
    delete window.matchMedia;
    render(<App />);
    expect(screen.queryByTestId('panel-scan')).not.toBeInTheDocument();
  });
});
