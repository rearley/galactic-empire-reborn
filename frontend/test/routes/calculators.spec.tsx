import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Calculators } from '../../src/routes/Calculators';
import { clearToken, setToken } from '../../src/auth/tokenStore';

/**
 * The calculator page.
 *
 * Every number it shows comes from the server, which runs the real economy
 * tick — so these tests are about the page being honest with what it is given:
 * that it asks the server rather than computing anything itself, that the rate
 * budget is visible, and that a server it cannot reach produces a plain
 * failure rather than a screen of zeroes a player would trust.
 */

const MODEL = {
  tickSeconds: 21_600,
  ticksPerDay: 4,
  items: [
    { index: 0, name: 'men', keyword: 'men', manhours: 3500, maxpl: 201228378, baseprice: 2, tons: 1 },
    { index: 1, name: 'missiles', keyword: 'mis', manhours: 300, maxpl: 39633, baseprice: 20, tons: 5 },
    { index: 2, name: 'torpedos', keyword: 'tor', manhours: 500, maxpl: 59833, baseprice: 7, tons: 3 },
    { index: 3, name: 'ion cannons', keyword: 'ion', manhours: 4, maxpl: 250, baseprice: 33, tons: 250 },
    { index: 4, name: 'flux pods', keyword: 'flu', manhours: 200, maxpl: 923, baseprice: 200, tons: 20 },
    { index: 5, name: 'food cases', keyword: 'foo', manhours: 8000, maxpl: 187312837, baseprice: 2, tons: 2 },
    { index: 6, name: 'fighters', keyword: 'fig', manhours: 100, maxpl: 579332, baseprice: 50, tons: 15 },
    { index: 7, name: 'decoys', keyword: 'dec', manhours: 900, maxpl: 5399, baseprice: 18, tons: 3 },
    { index: 8, name: 'troops', keyword: 'tro', manhours: 200, maxpl: 201228378, baseprice: 1, tons: 2 },
    { index: 9, name: 'zippers', keyword: 'zip', manhours: 100, maxpl: 5233, baseprice: 99, tons: 5 },
    { index: 10, name: 'jammers', keyword: 'jam', manhours: 300, maxpl: 25928, baseprice: 21, tons: 4 },
    { index: 11, name: 'mines', keyword: 'min', manhours: 500, maxpl: 25867, baseprice: 16, tons: 5 },
    { index: 12, name: 'gold', keyword: 'gol', manhours: 30, maxpl: 10000, baseprice: 1000, tons: 0.5 },
    { index: 13, name: 'spy', keyword: 'spy', manhours: 20, maxpl: 5, baseprice: 100, tons: 1 },
  ],
};

function result(over: Record<string, unknown> = {}) {
  return {
    rates: new Array(14).fill(0),
    rateClamps: [],
    taxrate: 0,
    fact: 2.625,
    rateBudgetUsed: 100,
    items: MODEL.items.map((item) => ({
      index: item.index, name: item.name, rate: item.index === 4 ? 52 : 0,
      producedPerTick: item.index === 4 ? 402 : 0,
      stockAfter: item.index === 4 ? 859 : 0,
      capacity: Math.floor(item.maxpl * 2.625),
      atCapacity: false,
      ticksToCapacity: item.index === 4 ? 4 : null,
      creditsPerTick: item.index === 4 ? 80_400 : 0,
      tonsPerTick: item.index === 4 ? 8040 : 0,
    })),
    food: { eatenPerTick: 6185, producedPerTick: 6494, netPerTick: 309, starvationFloor: 12370, minimumRate: 20, safe: true },
    tax: { perTick: 0, goodsLostPerTick: 0, troopsToHoldOrder: 0, willRevolt: false, sustainingTroopRate: 0, worthwhile: false },
    growth: { perTickPercent: 0.547, doublingDays: 31.7, populationCap: 528224492, daysToCap: 309 },
    starvedMen: 0,
    starvedTroops: 0,
    ...over,
  };
}

function mockServer(res = result()) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    void init;
    if (url.includes('planet-model')) return { ok: true, status: 200, json: async () => MODEL };
    return { ok: true, status: 200, json: async () => res };
  });
  globalThis.fetch = f as unknown as typeof fetch;
  return f;
}

/** The bodies this page POSTed to /public/calculator, oldest first. */
function posted(f: ReturnType<typeof mockServer>): CalcBody[] {
  return f.mock.calls
    .filter(([url]) => url.includes('/public/calculator'))
    .map(([, init]) => JSON.parse((init?.body as string | undefined) ?? '{}') as CalcBody);
}

interface CalcBody { stock: number[]; rates: number[]; taxrate: number }

function renderPage() {
  return render(<MemoryRouter><Calculators /></MemoryRouter>);
}

/**
 * Render and wait for the first result to land. Requests are debounced, so a
 * panel exists before its numbers do — querying between the two finds only
 * "Working…", which is a real state of the page and not what these tests mean.
 */
async function renderReady(): Promise<void> {
  renderPage();
  await screen.findByTestId('rate-budget');
}

/**
 * Render, then load the example so there are figures to assert on. The page
 * deliberately starts blank — it cannot see anyone's colonies and must not look
 * as though it can — so any test about the tables has to put data in first.
 */
async function renderWithData(): Promise<void> {
  await renderReady();
  await userEvent.click(screen.getByRole('button', { name: /example/i }));
  await waitFor(() => expect(screen.queryByTestId('empty-prompt')).not.toBeInTheDocument());
}

beforeEach(() => { vi.restoreAllMocks(); clearToken(); });

describe('Calculators', () => {
  it('asks the server to run the real tick rather than computing in the browser', async () => {
    const f = mockServer();
    renderPage();
    await waitFor(() => expect(f).toHaveBeenCalledWith('/public/planet-model'));
    await waitFor(() => expect(posted(f)).toHaveLength(1));
  });

  it('shows what a tick produces, in units and in credits', async () => {
    mockServer();
    await renderWithData();
    const row = screen.getByRole('cell', { name: 'flux pods' }).closest('tr')!;
    expect(within(row).getByText('402')).toBeInTheDocument();
    expect(within(row).getByText('80,400')).toBeInTheDocument();
  });

  it('states the production cadence, because six hours is the thing players get wrong', async () => {
    mockServer();
    await renderWithData();
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText(/one production tick, every 6 hours/i)).toBeInTheDocument();
  });

  it('tracks the shared rate budget', async () => {
    mockServer(result({ rateBudgetUsed: 80 }));
    await renderReady();
    const budget = screen.getByTestId('rate-budget');
    expect(budget).toHaveTextContent('80');
    expect(budget).toHaveTextContent(/20 unspent/i);
  });

  it('reports the cut when the budget would not stretch, naming the item', async () => {
    mockServer(result({
      rateBudgetUsed: 100,
      rateClamps: [{ index: 5, requested: 60, allowed: 40 }],
    }));
    await renderWithData();
    const notice = screen.getByTestId('rate-clamped');
    expect(notice).toHaveTextContent(/food cases/i);
    expect(notice).toHaveTextContent('60');
    expect(notice).toHaveTextContent('40');
  });

  it('says nothing about clamping when the spread fits', async () => {
    mockServer();
    await renderWithData();
    expect(screen.queryByTestId('rate-clamped')).not.toBeInTheDocument();
  });

  it('offers the four calculators as tabs, production first', async () => {
    mockServer();
    await renderReady();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Production', 'Survival', 'Tax', 'Growth']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('switches panels when another tab is chosen', async () => {
    mockServer();
    await renderWithData();
    await userEvent.click(screen.getByRole('tab', { name: 'Survival' }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText(/starvation begins below/i)).toBeInTheDocument();
  });

  it('warns on the survival tab when the colony is eating its stores', async () => {
    mockServer(result({
      food: { eatenPerTick: 6185, producedPerTick: 4330, netPerTick: -1855, starvationFloor: 12370, minimumRate: 30, safe: false },
    }));
    await renderWithData();
    await userEvent.click(screen.getByRole('tab', { name: 'Survival' }));
    expect(await screen.findByText(/-1,855/)).toBeInTheDocument();
  });

  it('says plainly when a tax rate costs more production than it collects', async () => {
    mockServer(result({
      taxrate: 30,
      tax: { perTick: 15_462, goodsLostPerTick: 20_100, troopsToHoldOrder: 40_000, willRevolt: true, sustainingTroopRate: 38.3, worthwhile: false },
    }));
    await renderWithData();
    await userEvent.click(screen.getByRole('tab', { name: 'Tax' }));
    expect(await screen.findByText(/40,000/)).toBeInTheDocument();
    expect(await screen.findByTestId('tax-verdict')).toHaveTextContent(/costs more than it collects/i);
  });

  it('captions the rate the server ran, not the one still being typed', async () => {
    mockServer(result({ taxrate: 0 }));
    await renderWithData();
    await userEvent.click(screen.getByRole('tab', { name: 'Tax' }));
    expect(await screen.findByTestId('tax-verdict')).toHaveTextContent(/untaxed/i);
  });

  it('does not fire a request per keystroke while a number is being typed', async () => {
    const f = mockServer();
    renderPage();
    const pop = await screen.findByLabelText(/population/i);
    await waitFor(() => expect(posted(f)).toHaveLength(1));

    // Six edits in quick succession — a held key, or a pasted figure retyped.
    for (const v of ['4', '42', '424', '4242', '42424', '424242']) {
      fireEvent.change(pop, { target: { value: v } });
    }

    await waitFor(() => {
      const posts = posted(f);
      expect(posts).toHaveLength(2);
      expect(posts[1].stock[0]).toBe(424_242);
    });
  });

  it('starts empty, so nothing on screen can be mistaken for the reader own colony', async () => {
    const f = mockServer();
    await renderReady();
    const sent = posted(f)[0];
    expect(sent.stock.every((v) => v === 0)).toBe(true);
    expect(sent.rates.every((v) => v === 0)).toBe(true);
    expect(sent.taxrate).toBe(0);
  });

  it('tells a signed-out reader where the figures come from, and that signing in can fill them', async () => {
    // A filled form implies the page read a colony. Signed out it has not, and
    // says so — and says what would change that.
    mockServer();
    await renderReady();
    expect(screen.getByText(/sign in to load one of your own colonies/i)).toBeInTheDocument();
  });

  it('prompts for figures rather than presenting a table of zeroes', async () => {
    mockServer();
    await renderReady();
    expect(screen.getByTestId('empty-prompt')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('loads a worked example on request, and it is plainly not a real colony', async () => {
    const f = mockServer();
    await renderReady();
    await userEvent.click(screen.getByRole('button', { name: /example/i }));
    await waitFor(() => expect(posted(f).length).toBeGreaterThan(1));

    const all = posted(f);
    const sent = all[all.length - 1];
    expect(sent.stock[0]).toBe(100_000);
    // Round numbers on purpose: a reader must not take these for someone's real figures.
    expect(sent.stock[0] % 10_000).toBe(0);
    expect(screen.queryByTestId('empty-prompt')).not.toBeInTheDocument();
  });

  it('tells the reader the tax pool is theirs, unlike planet cash', async () => {
    mockServer();
    await renderWithData();
    await userEvent.click(screen.getByRole('tab', { name: 'Tax' }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('wit')).toBeInTheDocument();
    expect(within(panel).getByText(/planet cash never can be/i)).toBeInTheDocument();
  });

  it('recalculates every tab from one shared colony, not per-tab state', async () => {
    const f = mockServer();
    await renderWithData();
    await userEvent.click(screen.getByRole('tab', { name: 'Survival' }));

    // A rate typed on Survival must reach the same request Production uses.
    const foodRate = screen.getByLabelText(/food cases rate/i);
    fireEvent.change(foodRate, { target: { value: '30' } });

    await waitFor(() => {
      const all = posted(f);
      expect(all[all.length - 1].rates[5]).toBe(30);
    });
  });

  it('puts the food rate on the survival tab, where the advice about it is', async () => {
    mockServer();
    await renderWithData();
    await userEvent.click(screen.getByRole('tab', { name: 'Survival' }));
    expect(screen.getByLabelText(/food cases rate/i)).toBeInTheDocument();
  });

  it('lets the reader adopt the minimum food rate it just quoted', async () => {
    const f = mockServer(result({
      food: { eatenPerTick: 2, producedPerTick: 0, netPerTick: -2, starvationFloor: 4, minimumRate: 30, safe: false },
    }));
    await renderWithData();
    await userEvent.click(screen.getByRole('tab', { name: 'Survival' }));
    await userEvent.click(screen.getByRole('button', { name: /use 30/i }));

    await waitFor(() => {
      const all = posted(f);
      expect(all[all.length - 1].rates[5]).toBe(30);
    });
  });

  it('puts the men rate on the growth tab, for the same reason', async () => {
    mockServer();
    await renderWithData();
    await userEvent.click(screen.getByRole('tab', { name: 'Growth' }));
    expect(screen.getByLabelText(/men rate/i)).toBeInTheDocument();
  });

  it('explains every column, for readers who have not read GEPLANET.C', async () => {
    mockServer();
    await renderWithData();
    const panel = screen.getByRole('tabpanel');
    for (const term of [
      'Made each tick', 'Worth if sold', 'Cargo tons',
      'Storage cap', 'Ticks until full', 'Credits per ton',
    ]) {
      // once as a column head, once as a key entry
      expect(within(panel).getAllByText(term).length).toBeGreaterThanOrEqual(2);
    }
    expect(within(panel).getByText(/what the Empire pays for that production at Zygor-3/i)).toBeInTheDocument();
    expect(within(panel).getByText(/how long you can leave it before production starts going to waste/i)).toBeInTheDocument();
  });

  it('says what the production multiplier is, not just its value', async () => {
    mockServer();
    await renderWithData();
    expect(screen.getByText(/planet quality, times the tax penalty/i)).toBeInTheDocument();
  });

  it('explains why a small colony food rate looks ruinous', async () => {
    mockServer(result({
      fact: 1.75,
      food: { eatenPerTick: 2, producedPerTick: 0, netPerTick: -2, starvationFloor: 4, minimumRate: 30, safe: false },
    }));
    await renderWithData();
    await userEvent.click(screen.getByRole('tab', { name: 'Survival' }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText(/because the colony is small/i)).toBeInTheDocument();
    // 52.5 / 1.75 = 30 at this quality, settling to 30 at any size
    expect(within(panel).getByText('52.5 ÷ 1.75')).toBeInTheDocument();
  });

  /**
   * A deploy puts the two halves out of step for a few seconds, and an older
   * server answers 200 with a body missing whatever the newer page added. The
   * page must degrade, not white-screen: a blank tab is the one failure a player
   * cannot interpret or report.
   */
  it('survives a response from an older server that lacks newer fields', async () => {
    const partial = result();
    delete (partial as Record<string, unknown>).rateClamps;
    delete (partial as Record<string, unknown>).rates;
    mockServer(partial);

    await renderWithData();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    expect(screen.queryByTestId('rate-clamped')).not.toBeInTheDocument();
  });

  it('survives a response whose item list is missing entirely', async () => {
    const partial = result();
    delete (partial as Record<string, unknown>).items;
    mockServer(partial);

    await renderReady();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('survives a response missing the survival and tax blocks', async () => {
    const partial = result();
    delete (partial as Record<string, unknown>).food;
    delete (partial as Record<string, unknown>).tax;
    delete (partial as Record<string, unknown>).growth;
    mockServer(partial);

    await renderReady();
    await userEvent.click(screen.getByRole('tab', { name: 'Survival' }));
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Tax' }));
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('clears every rate at once, so a spread can be started over', async () => {
    const f = mockServer();
    await renderWithData();
    await userEvent.click(screen.getByRole('button', { name: /clear all rates/i }));
    await waitFor(() => {
      const all = posted(f);
      expect(all[all.length - 1].rates.every((v) => v === 0)).toBe(true);
    });
  });

  it('carries the budget in the table footer, where the rates are being typed', async () => {
    mockServer(result({ rateBudgetUsed: 70 }));
    await renderWithData();
    const foot = screen.getByTestId('rate-total');
    expect(foot).toHaveTextContent('70');
    expect(foot).toHaveTextContent(/30 left/i);
  });

  it('marks the clamped row itself, not only the notice above the tabs', async () => {
    mockServer(result({
      rateBudgetUsed: 100,
      rateClamps: [{ index: 5, requested: 60, allowed: 40 }],
    }));
    await renderWithData();
    const row = screen.getByRole('cell', { name: 'food cases' }).closest('tr')!;
    expect(within(row).getByTestId('row-clamped')).toHaveTextContent('40');
  });

  it('summarises rather than listing nine cut items in a sentence', async () => {
    mockServer(result({
      rateBudgetUsed: 100,
      rateClamps: Array.from({ length: 9 }, (_, i) => ({ index: i + 5, requested: 20, allowed: 0 })),
    }));
    await renderWithData();
    const notice = screen.getByTestId('rate-clamped');
    expect(notice).toHaveTextContent(/6 more/i);
    // three named, not nine
    expect(notice.textContent!.match(/rather than/g)).toHaveLength(3);
  });

  it('says so when the server cannot be reached, rather than showing zeroes', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByText(/could not reach/i)).toBeInTheDocument();
  });

  it('is honest that it models this deployment and is not part of the original', async () => {
    mockServer();
    renderPage();
    expect(await screen.findByText(/the original had no such thing/i)).toBeInTheDocument();
  });
});

/**
 * A signed-in player can fill the form from one of their own colonies.
 *
 * The list comes from `/public/my-planets`, which answers for the account in
 * the token and nothing else. These tests are about the page: it only asks
 * when someone is signed in, a pick reaches the tick exactly like typing
 * would, and a failed lookup leaves the page usable rather than broken.
 */
function stockOf(men: number, food: number): number[] {
  const s = new Array<number>(14).fill(0); s[0] = men; s[5] = food; return s;
}
function ratesOf(food: number, gold: number): number[] {
  const r = new Array<number>(14).fill(0); r[5] = food; r[12] = gold; return r;
}
const reply = (ok: boolean, code: number, payload: unknown) =>
  ({ ok, status: code, json: async (): Promise<unknown> => payload });

describe('Calculators — your own colonies', () => {
  const HOME = {
    xsect: 3, ysect: -5, plnum: 1, name: 'Zygor II',
    input: { stock: stockOf(424_242, 30_000), rates: ratesOf(23, 2), enviorn: 3, resource: 1, taxrate: 15, planetCash: 12_345 },
  };
  const OUTPOST = {
    xsect: -7, ysect: 2, plnum: 2, name: 'Outpost',
    input: { stock: stockOf(5_000, 900), rates: ratesOf(40, 0), enviorn: 1, resource: 2, taxrate: 0, planetCash: 0 },
  };

  function mockWithPlanets(planets: unknown, status = 200) {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (url.includes('planet-model')) return reply(true, 200, MODEL);
      if (url.includes('my-planets')) return reply(status === 200, status, planets);
      return reply(true, 200, result());
    });
    globalThis.fetch = f as unknown as typeof fetch;
    return f;
  }

  /** The newest body POSTed to the calculator. */
  function lastPost(f: ReturnType<typeof mockWithPlanets>): CalcBody {
    const all = posted(f as unknown as ReturnType<typeof mockServer>);
    return all[all.length - 1];
  }

  it('does not ask for anyone\'s colonies when nobody is signed in', async () => {
    const f = mockWithPlanets([HOME]);
    await renderReady();
    expect(f.mock.calls.some(([url]) => url.includes('my-planets'))).toBe(false);
    expect(screen.queryByLabelText(/load one of your colonies/i)).not.toBeInTheDocument();
  });

  it('sends the token, and lists each colony by name and sector', async () => {
    setToken('tok');
    const f = mockWithPlanets([OUTPOST, HOME]);
    await renderReady();
    const select = await screen.findByLabelText(/load one of your colonies/i);
    expect(within(select).getByRole('option', { name: 'Zygor II — sector (3,-5)' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Outpost — sector (-7,2)' })).toBeInTheDocument();
    const call = f.mock.calls.find(([url]) => url.includes('my-planets'));
    const headers = (call?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('runs a picked colony through the tick exactly as if it had been typed', async () => {
    setToken('tok');
    const f = mockWithPlanets([HOME]);
    await renderReady();
    const select = await screen.findByLabelText(/load one of your colonies/i);
    fireEvent.change(select, { target: { value: '3:-5:1' } });
    await waitFor(() => {
      const last = lastPost(f);
      expect(last.stock[0]).toBe(424_242);
      expect(last.rates[12]).toBe(2);
      expect(last.taxrate).toBe(15);
    });
  });

  it('puts the colony back after the player has tried other figures', async () => {
    setToken('tok');
    const f = mockWithPlanets([HOME]);
    await renderReady();
    fireEvent.change(await screen.findByLabelText(/load one of your colonies/i), { target: { value: '3:-5:1' } });
    fireEvent.change(screen.getByLabelText(/tax rate/i), { target: { value: '40' } });
    await waitFor(() => expect(lastPost(f).taxrate).toBe(40));
    await userEvent.click(screen.getByRole('button', { name: /reset to planet/i }));
    await waitFor(() => expect(lastPost(f).taxrate).toBe(15));
  });

  it('says so plainly when the player owns no colonies yet', async () => {
    setToken('tok');
    mockWithPlanets([]);
    await renderReady();
    expect(await screen.findByText(/you don't own any planets yet/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/load one of your colonies/i)).not.toBeInTheDocument();
  });

  it('behaves as signed out when the lookup is refused, rather than showing an error', async () => {
    setToken('stale');
    mockWithPlanets({ message: 'Unauthorized' }, 401);
    await renderReady();
    await waitFor(() => expect(screen.queryByLabelText(/load one of your colonies/i)).not.toBeInTheDocument());
    expect(screen.queryByText(/could not reach/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/you don't own any planets yet/i)).not.toBeInTheDocument();
  });
});

