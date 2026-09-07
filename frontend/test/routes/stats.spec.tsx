import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { Stats } from '../../src/routes/Stats';

function mockStats(body: unknown, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok, status: ok ? 200 : 500, json: async () => body,
  }) as unknown as typeof fetch;
}

function renderStats() {
  return render(<MemoryRouter><Stats /></MemoryRouter>);
}

const BODY = {
  commanders: 9,
  online: 2,
  roster: [
    { rank: 1, username: 'rick', score: '15345', kills: 31, planets: 3 },
    { rank: 2, username: 'vraskcmdr', score: '900', kills: 2, planets: 0 },
  ],
};

describe('Stats', () => {
  it('shows the counts', async () => {
    // Scoped to the counts block on purpose: '2' is also the rank cell of the
    // second roster row, and an unscoped getByText('2') matches both and throws.
    mockStats(BODY);
    renderStats();
    const counts = await screen.findByTestId('stat-counts');
    expect(counts).toHaveTextContent('9');
    expect(counts).toHaveTextContent('2');
  });

  it('renders every roster row', async () => {
    mockStats(BODY);
    renderStats();
    expect(await screen.findByText('rick')).toBeInTheDocument();
    expect(await screen.findByText('15345')).toBeInTheDocument();
    expect(await screen.findByText('vraskcmdr')).toBeInTheDocument();
  });

  it('says so plainly when nobody has scored yet', async () => {
    // A launch-day board is empty. An empty table with headers reads as broken.
    mockStats({ commanders: 1, online: 0, roster: [] });
    renderStats();
    expect(await screen.findByText(/no one has scored yet/i)).toBeInTheDocument();
  });

  it('shows an error instead of hanging when the server is down', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    renderStats();
    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable|could not/i);
  });

  it('polls rather than freezing on first paint', async () => {
    vi.useFakeTimers();
    mockStats(BODY);
    renderStats();
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1));
    vi.useRealTimers();
  });
});
