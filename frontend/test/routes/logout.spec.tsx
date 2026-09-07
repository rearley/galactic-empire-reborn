import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { ShipSelectPrompt } from '../../src/onboarding/ShipSelectPrompt';
import { SiteHeader } from '../../src/routes/SiteHeader';
import { setToken, getToken, clearToken } from '../../src/auth/tokenStore';
import { logout } from '../../src/auth/logout';

vi.mock('../../src/socket/socketClient', () => ({
  socket: { disconnect: vi.fn(), connected: true },
  connectSocket: vi.fn(),
  onSocketAuthFailed: vi.fn(),
}));

const SHIPS = [
  { index: 1, shipno: 1, className: 'Interceptor', shipname: 'Vraska', sector: { x: 0, y: 0 } },
  { index: 2, shipno: 2, className: 'Dreadnought', shipname: 'Korrin', sector: { x: 3, y: 4 } },
];

afterEach(() => clearToken());

describe('logout', () => {
  it('clears the stored token', () => {
    setToken('some.jwt.token');
    const assign = vi.fn();
    logout(assign);
    expect(getToken()).toBeNull();
  });

  it('sends the player to the front door', () => {
    setToken('some.jwt.token');
    const assign = vi.fn();
    logout(assign);
    expect(assign).toHaveBeenCalledWith('/');
  });
});

describe('ShipSelectPrompt', () => {
  it('offers a logout beneath the fleet', () => {
    // This is the only place inside the game that offers it. Logging out
    // disconnects the socket, which is warhupa — with cantexit > 0 that
    // destroys the hull. `x` has already run and enforced cantexit by the time
    // this screen appears.
    render(<ShipSelectPrompt ships={SHIPS} onSelect={vi.fn()} error={null} onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: /log ?out/i })).toBeInTheDocument();
  });

  it('calls onLogout when chosen', async () => {
    const onLogout = vi.fn();
    render(<ShipSelectPrompt ships={SHIPS} onSelect={vi.fn()} error={null} onLogout={onLogout} />);
    await userEvent.click(screen.getByRole('button', { name: /log ?out/i }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('still renders the fleet when no logout handler is supplied', () => {
    render(<ShipSelectPrompt ships={SHIPS} onSelect={vi.fn()} error={null} />);
    expect(screen.getByTestId('ship-select')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log ?out/i })).not.toBeInTheDocument();
  });
});

describe('SiteHeader when localStorage throws', () => {
  // SiteHeader.getToken() is called on the public landing page — the first
  // thing a stranger sees. A browser that blocks storage (private mode,
  // Chrome with site data blocked) must not blank that page.
  it('renders the signed-out links rather than throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    expect(() =>
      render(
        <MemoryRouter>
          <SiteHeader />
        </MemoryRouter>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /enlist/i })).toBeInTheDocument();
    spy.mockRestore();
  });
});
