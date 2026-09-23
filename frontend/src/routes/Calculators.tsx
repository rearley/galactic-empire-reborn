import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { getToken } from '../auth/tokenStore';
import {
  PAGE_TITLE, PAGE_BLURB, SCOPE_NOTE, Tip,
  PRODUCTION_TIPS, SURVIVAL_TIPS, TAX_TIPS, GROWTH_TIPS,
} from '../content/calculator-notes';

/**
 * /calculators — work out what a colony will produce.
 *
 * The page computes nothing. Every figure is returned by `/public/calculator`,
 * which runs the caller's numbers through the same economy tick the live game
 * runs. That is deliberate and worth defending: a calculator that reimplements
 * `multiply()` in TypeScript is a second source of truth, and the first time it
 * drifts it teaches players something false about a game whose whole pitch is
 * fidelity. The cost is a round trip per edit, which is cheap.
 *
 * @see backend/src/public/calculator.ts
 */

interface PlanetModelItem {
  index: number; name: string; keyword: string;
  manhours: number; maxpl: number; baseprice: number; tons: number;
}
interface PlanetModel { tickSeconds: number; ticksPerDay: number; items: PlanetModelItem[] }

/** What the calculator takes, and what one of your colonies arrives as. */
interface ColonyFigures {
  stock: number[]; rates: number[];
  enviorn: number; resource: number; taxrate: number; planetCash: number;
}

/**
 * One of the signed-in player's own colonies, from `/public/my-planets`.
 * @see backend/src/public/my-planets.ts
 */
interface MyPlanet { xsect: number; ysect: number; plnum: number; name: string; input: ColonyFigures }

const planetId = (p: Pick<MyPlanet, 'xsect' | 'ysect' | 'plnum'>): string => `${p.xsect}:${p.ysect}:${p.plnum}`;

interface ItemResult {
  index: number; name: string; rate: number;
  producedPerTick: number; stockAfter: number; capacity: number;
  atCapacity: boolean; ticksToCapacity: number | null;
  creditsPerTick: number; tonsPerTick: number;
}
interface RateClamp { index: number; requested: number; allowed: number }
interface CalcResult {
  rates: number[];
  rateClamps: RateClamp[];
  taxrate: number;
  fact: number;
  rateBudgetUsed: number;
  items: ItemResult[];
  food: {
    eatenPerTick: number; producedPerTick: number; netPerTick: number;
    starvationFloor: number; minimumRate: number; safe: boolean;
  };
  tax: {
    perTick: number; goodsLostPerTick: number; troopsToHoldOrder: number;
    willRevolt: boolean; sustainingTroopRate: number; worthwhile: boolean;
  };
  growth: {
    perTickPercent: number; doublingDays: number | null;
    populationCap: number; daysToCap: number | null;
  };
  starvedMen: number;
  starvedTroops: number;
}

/** Long enough to swallow a held key, short enough to feel live. */
const REQUEST_DEBOUNCE_MS = 250;

/**
 * How many squeezed items to name before summarising.
 *
 * Typing the same rate into every slot is a natural thing to try, and it clamps
 * nine of the fourteen at once — naming them all turns a warning into a
 * paragraph nobody reads. The row markers in the table carry the detail.
 */
const NAMED_CLAMPS = 3;

const NUMITEMS = 14;
const I_MEN = 0;
const I_FOOD = 5;
const I_TROOPS = 8;

const TABS = ['Production', 'Survival', 'Tax', 'Growth'] as const;
type Tab = (typeof TABS)[number];

const GRADES = ['Poor', 'Marginal', 'Good', 'Very Good'];

const I_FLUX = 4;
const I_GOLD = 12;

/**
 * The page starts EMPTY, and that is the point.
 *
 * It first shipped prefilled with a real colony's figures. Two things are wrong
 * with that. The smaller one is that a populated form implies the page read your
 * planet — it cannot, it has no session and no idea who you are, and a player
 * with several colonies would rightly ask which one it picked. The larger one is
 * that the numbers were somebody's actual live colony, published to every
 * visitor of a public page.
 *
 * So: zeroes until the reader types, and an example they opt into. The example
 * uses round numbers for the same reason — nobody should be able to mistake it
 * for a real player's holdings. *
 * A signed-in player can now load one of their OWN colonies, and that answers
 * both objections rather than reopening them: the form fills only when they
 * pick a named colony, so it never implies a guess, and the figures go only to
 * the account that owns them. The page still starts empty.
 * @see docs/DECISIONS.md 2026-09-19 — the calculator may read your own colonies
 */
const EMPTY = {
  stock: new Array<number>(NUMITEMS).fill(0),
  rates: new Array<number>(NUMITEMS).fill(0),
  enviorn: 2,
  resource: 2,
  taxrate: 0,
  planetCash: 0,
};

/** Deliberately round, deliberately nobody's. */
const EXAMPLE = {
  stock: (() => {
    const s = new Array<number>(NUMITEMS).fill(0);
    s[I_MEN] = 100_000;
    s[I_FOOD] = 10_000;
    return s;
  })(),
  rates: (() => {
    const r = new Array<number>(NUMITEMS).fill(0);
    r[I_MEN] = 25; r[I_FLUX] = 50; r[I_FOOD] = 23; r[I_GOLD] = 2;
    return r;
  })(),
  enviorn: 2,
  resource: 2,
  taxrate: 0,
  planetCash: 1_000,
};

const n = (v: number): string => Math.round(v).toLocaleString();
const n1 = (v: number): string => v.toFixed(1);

function Field({ label, value, onChange, min = 0, max = 2_000_000_000 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}): React.JSX.Element {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={id} className="block">
      <span className="block text-xs uppercase tracking-widest text-gray-500">{label}</span>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        className="mt-1 w-full border border-gray-800 bg-black px-2 py-1 font-mono text-sm text-gray-100 focus:border-yellow-400 focus:outline-none"
      />
    </label>
  );
}

function Grade({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}): React.JSX.Element {
  const id = `g-${label.toLowerCase()}`;
  return (
    <label htmlFor={id} className="block">
      <span className="block text-xs uppercase tracking-widest text-gray-500">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full border border-gray-800 bg-black px-2 py-1 font-mono text-sm text-gray-100 focus:border-yellow-400 focus:outline-none"
      >
        {GRADES.map((g, i) => <option key={g} value={i}>{g}</option>)}
      </select>
    </label>
  );
}

/**
 * A single rate control, for the tabs whose advice is about one rate.
 *
 * The full table lives on Production, but Survival quoting a minimum food rate
 * with no way to set it — and Growth quoting a doubling time with no men rate —
 * makes the reader hunt for the control that the advice is about. Same state,
 * so editing here moves the whole page.
 */
function RateControl({ label, value, onChange, suggestion, onAdopt }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suggestion?: number;
  onAdopt?: () => void;
}): React.JSX.Element {
  const id = `rate-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border border-gray-800 px-3 py-2">
      <label htmlFor={id} className="text-xs uppercase tracking-widest text-gray-500">
        {label} rate
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        className="w-20 border border-gray-800 bg-black px-2 py-1 text-sm text-gray-100 focus:border-yellow-400 focus:outline-none"
      />
      {suggestion !== undefined && onAdopt && suggestion !== value && (
        <button
          type="button"
          onClick={onAdopt}
          className="text-xs uppercase tracking-widest text-yellow-400 hover:text-yellow-200"
        >
          Use {suggestion}
        </button>
      )}
    </div>
  );
}

function Tips({ items }: { items: readonly Tip[] }): React.JSX.Element {
  return (
    <dl className="mt-8 space-y-5 border-t border-gray-800 pt-6">
      {items.map((t) => (
        <div key={t.what} className="border-l-2 border-gray-800 pl-4">
          <dt className="text-sm text-yellow-400">{t.what}</dt>
          <dd className="mt-1 text-sm leading-relaxed text-gray-300">{t.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

function Stat({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: 'bad' | 'good';
}): React.JSX.Element {
  const colour = tone === 'bad' ? 'text-red-400' : tone === 'good' ? 'text-green-400' : 'text-gray-100';
  return (
    <div className="border border-gray-800 px-3 py-2">
      <div className="text-xs uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`mt-1 text-lg ${colour}`}>{value}</div>
      {hint && <div className="mt-1 text-xs leading-snug text-gray-500">{hint}</div>}
    </div>
  );
}

/** What each column of the production table actually means. */
function ColumnKey(): React.JSX.Element {
  const rows: readonly [string, string][] = [
    ['Rate', 'Share of the colony\u2019s work given to this item. All fourteen share one budget of 100, the same number you set with adm rate.'],
    ['Made each tick', 'Units the colony finishes every 6 hours at that rate.'],
    ['Worth if sold', 'What the Empire pays for that production at Zygor-3, at base price. It is not profit \u2014 you still have to fly it there, and there is a 0.1% transfer fee.'],
    ['Cargo tons', 'Hold space that production takes. A Freight Barge holds 200,000; a Dreadnought 40,000.'],
    ['Storage cap', 'The most the colony will ever hold of this item. Anything made past it is thrown away.'],
    ['Ticks until full', 'How many 6-hour ticks until this item hits that cap from where it stands now \u2014 in other words, how long you can leave it before production starts going to waste.'],
    ['Credits per ton', 'Value per unit of hold space. This is the number that matters once your cargo hold, rather than your production, is what limits you.'],
  ];
  return (
    <dl className="mt-6 grid gap-3 border-t border-gray-800 pt-5 sm:grid-cols-2">
      {rows.map(([term, meaning]) => (
        <div key={term}>
          <dt className="text-xs uppercase tracking-widest text-yellow-400">{term}</dt>
          <dd className="mt-1 text-xs leading-relaxed text-gray-400">{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Fill in anything a response did not carry.
 *
 * A deploy replaces the two halves separately, so for a few seconds the page can
 * be newer than the server answering it. That server returns 200 with a body
 * missing whatever was added last, and a render path that trusts the shape dies
 * on the first `.length` — a white tab, which is the one failure a player can
 * neither read nor report. Normalising once here means every reader below can
 * assume the shape, and a stale field degrades to "nothing to say" instead.
 */
function normalise(raw: Partial<CalcResult> | null): CalcResult | null {
  if (!raw) return null;
  const zeroes = new Array<number>(NUMITEMS).fill(0);
  return {
    rates: Array.isArray(raw.rates) ? raw.rates : zeroes,
    rateClamps: Array.isArray(raw.rateClamps) ? raw.rateClamps : [],
    taxrate: raw.taxrate ?? 0,
    fact: raw.fact ?? 0,
    rateBudgetUsed: raw.rateBudgetUsed ?? 0,
    items: Array.isArray(raw.items) ? raw.items : [],
    food: raw.food ?? {
      eatenPerTick: 0, producedPerTick: 0, netPerTick: 0,
      starvationFloor: 0, minimumRate: 0, safe: true,
    },
    tax: raw.tax ?? {
      perTick: 0, goodsLostPerTick: 0, troopsToHoldOrder: 0,
      willRevolt: false, sustainingTroopRate: 0, worthwhile: false,
    },
    growth: raw.growth ?? {
      perTickPercent: 0, doublingDays: null, populationCap: 0, daysToCap: null,
    },
    starvedMen: raw.starvedMen ?? 0,
    starvedTroops: raw.starvedTroops ?? 0,
  };
}

export function Calculators(): React.JSX.Element {
  const [model, setModel] = useState<PlanetModel | null>(null);
  const [stock, setStock] = useState<number[]>(EMPTY.stock);
  const [rates, setRates] = useState<number[]>(EMPTY.rates);
  const [enviorn, setEnviorn] = useState(EMPTY.enviorn);
  const [resource, setResource] = useState(EMPTY.resource);
  const [taxrate, setTaxrate] = useState(EMPTY.taxrate);
  const [planetCash, setPlanetCash] = useState(EMPTY.planetCash);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [tab, setTab] = useState<Tab>('Production');
  const [failed, setFailed] = useState(false);
  /**
   * The signed-in player's colonies. `null` means there is nothing to offer —
   * signed out, or the lookup was refused — and the page then reads exactly as
   * it does for a visitor. An empty array means signed in with no colonies.
   */
  const [myPlanets, setMyPlanets] = useState<MyPlanet[] | null>(null);
  const [pickedId, setPickedId] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/public/planet-model')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: PlanetModel) => { if (!cancelled) setModel(m); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Only asked when someone is signed in. The server answers for the account in
  // the token and nothing else, and a refusal (a stale token, say) is not an
  // error worth showing on a page that works perfectly well without it.
  useEffect(() => {
    const token = getToken();
    let cancelled = false;
    if (token) {
      fetch('/public/my-planets', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((list: MyPlanet[]) => { if (!cancelled && Array.isArray(list)) setMyPlanets(list); })
        .catch(() => { /* behave as signed out */ });
    }
    return () => { cancelled = true; };
  }, []);

  const body = useMemo(
    () => JSON.stringify({ stock, rates, enviorn, resource, taxrate, planetCash }),
    [stock, rates, enviorn, resource, taxrate, planetCash],
  );

  // Debounced, because every field on this page is a number input and a held
  // arrow key would otherwise post once per repeat. Responses are also guarded
  // by `cancelled`: the endpoint is fast enough that two in flight can land out
  // of order, and the older one must not overwrite the newer.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch('/public/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((res: Partial<CalcResult>) => {
          if (!cancelled) { setResult(normalise(res)); setFailed(false); }
        })
        .catch(() => { if (!cancelled) setFailed(true); });
    }, REQUEST_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [body]);

  const setAt = useCallback(
    (arr: number[], set: (v: number[]) => void) => (i: number, v: number) => {
      const next = arr.slice();
      next[i] = v;
      set(next);
    },
    [],
  );
  const setRate = setAt(rates, setRates);
  const setStockAt = setAt(stock, setStock);

  const applyFigures = useCallback((f: ColonyFigures) => {
    setStock(f.stock.slice());
    setRates(f.rates.slice());
    setEnviorn(f.enviorn);
    setResource(f.resource);
    setTaxrate(f.taxrate);
    setPlanetCash(f.planetCash);
  }, []);

  const loadExample = useCallback(() => {
    setPickedId('');
    applyFigures(EXAMPLE);
  }, [applyFigures]);

  const picked = myPlanets?.find((p) => planetId(p) === pickedId);

  /** Fill the form from a colony. Nothing goes back to the game. */
  const pickPlanet = useCallback((id: string) => {
    setPickedId(id);
    const p = myPlanets?.find((q) => planetId(q) === id);
    if (p) applyFigures(p.input);
  }, [myPlanets, applyFigures]);

  const clearRates = useCallback(() => setRates(new Array<number>(NUMITEMS).fill(0)), []);

  /** The clamp that hit this slot, if the budget would not stretch to it. */
  const clampFor = useCallback(
    (index: number) => result?.rateClamps.find((c) => c.index === index),
    [result],
  );

  /** Nothing has been entered yet, so there is nothing worth tabulating. */
  const blank = stock[I_MEN] === 0 && rates.every((r) => r === 0);

  if (failed && !result) {
    return (
      <div className="min-h-screen bg-black font-mono text-gray-100">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-2xl uppercase tracking-widest text-yellow-400">{PAGE_TITLE}</h1>
          <p className="mt-6 text-sm text-red-400">
            Could not reach the server, so there is nothing to show. Every figure on this page is
            computed by the live game code — showing you zeroes instead would be worse than
            showing you nothing.
          </p>
        </main>
      <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black font-mono text-gray-100">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl uppercase tracking-widest text-yellow-400">{PAGE_TITLE}</h1>
        <p className="mt-2 text-sm uppercase tracking-widest text-gray-500">{PAGE_BLURB}</p>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-gray-400">{SCOPE_NOTE}</p>

        <section className="mt-8 border border-gray-800 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xs uppercase tracking-widest text-gray-500">Your colony</h2>
            <button
              type="button"
              onClick={loadExample}
              className="text-xs uppercase tracking-widest text-yellow-400 hover:text-yellow-200"
            >
              Load an example
            </button>
          </div>
          {myPlanets === null ? (
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              Sign in to load one of your own colonies, or type the figures from{' '}
              <span className="text-gray-300">adm</span> in game.
            </p>
          ) : myPlanets.length === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              You don't own any planets yet. Type the figures from{' '}
              <span className="text-gray-300">adm</span> to plan one.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label htmlFor="my-planet" className="block">
                <span className="block text-xs uppercase tracking-widest text-gray-500">
                  Load one of your colonies
                </span>
                <select
                  id="my-planet"
                  value={pickedId}
                  onChange={(e) => pickPlanet(e.target.value)}
                  className="mt-1 border border-gray-800 bg-black px-2 py-1 font-mono text-sm text-gray-100 focus:border-yellow-400 focus:outline-none"
                >
                  <option value="">Choose a colony…</option>
                  {myPlanets.map((p) => (
                    <option key={planetId(p)} value={planetId(p)}>
                      {`${p.name} — sector (${p.xsect},${p.ysect})`}
                    </option>
                  ))}
                </select>
              </label>
              {picked && (
                <button
                  type="button"
                  onClick={() => applyFigures(picked.input)}
                  className="text-xs uppercase tracking-widest text-yellow-400 hover:text-yellow-200"
                >
                  Reset to planet
                </button>
              )}
              <span className="text-xs text-gray-500">
                Changes here are for planning only — nothing is sent back to the game.
              </span>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Population" value={stock[I_MEN]} onChange={(v) => setStockAt(I_MEN, v)} />
            <Field label="Food cases" value={stock[I_FOOD]} onChange={(v) => setStockAt(I_FOOD, v)} />
            <Field label="Troops" value={stock[I_TROOPS]} onChange={(v) => setStockAt(I_TROOPS, v)} />
            <Grade label="Environment" value={enviorn} onChange={setEnviorn} />
            <Grade label="Resource" value={resource} onChange={setResource} />
            <Field label="Tax rate %" value={taxrate} onChange={setTaxrate} max={100} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Planet cash" value={planetCash} onChange={setPlanetCash} />
            <div className="col-span-1 sm:col-span-2 flex items-end">
              <p className="text-xs leading-relaxed text-gray-500">
                Planet cash above zero applies the 1.5x production bonus. Copy these from{' '}
                <span className="text-gray-300">adm</span> in game.
              </p>
            </div>
          </div>
        </section>

        {result && (
          <p
            data-testid="rate-budget"
            className="mt-4 text-sm text-gray-400"
          >
            Rate budget: {result.rateBudgetUsed} of 100
            {` — ${100 - result.rateBudgetUsed} unspent`}
          </p>
        )}

        {result && result.rateClamps.length > 0 && model && (
          <p data-testid="rate-clamped" className="mt-1 text-sm leading-relaxed text-yellow-400">
            The colony only has a hundred points of work to give, so{' '}
            {result.rateClamps.slice(0, NAMED_CLAMPS).map((c, i) => (
              <span key={c.index}>
                {i > 0 && ', '}
                {model.items[c.index]?.name ?? `item ${c.index}`} was set to{' '}
                <span className="text-yellow-200">{c.allowed}</span> rather than {c.requested}
              </span>
            ))}
            {result.rateClamps.length > NAMED_CLAMPS &&
              `, and ${result.rateClamps.length - NAMED_CLAMPS} more were left with nothing`}
            . In game <span className="text-yellow-200">adm rate</span> cuts it the same way, and the
            figures below are for the colony you would actually get.
          </p>
        )}

        {result && (
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Production multiplier <span className="text-gray-300">{result.fact.toFixed(3)}</span> —
            planet quality, times the tax penalty, times 1.5 if the planet holds any cash. Every
            figure below is scaled by it, including the storage caps.
          </p>
        )}

        <div role="tablist" className="mt-6 flex gap-1 border-b border-gray-800">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm uppercase tracking-widest ${
                tab === t
                  ? 'border-b-2 border-yellow-400 text-yellow-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="mt-6">
          {!result && <p className="text-sm text-gray-500">Working…</p>}

          {result && blank && (
            <p data-testid="empty-prompt" className="text-sm leading-relaxed text-gray-400">
              Enter your colony&rsquo;s population and production rates above and the figures will
              appear here. Nothing is filled in for you, because this page cannot see your planets —
              if you just want a look at how it behaves, load the example.
            </p>
          )}

          {result && model && !blank && tab === 'Production' && (
            <>
              <p className="text-sm text-gray-400">
                One production tick, every 6 hours — {model.ticksPerDay} a day. Change a rate and the
                server runs a real tick with it and reports what came out. What each column means is
                set out under the table.
              </p>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={clearRates}
                  className="text-xs uppercase tracking-widest text-yellow-400 hover:text-yellow-200"
                >
                  Clear all rates
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[46rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-widest text-gray-500">
                      <th className="py-2 pr-3">Item</th>
                      <th className="py-2 pr-3">Rate</th>
                      <th className="py-2 pr-3 text-right">Made each tick</th>
                      <th className="py-2 pr-3 text-right">Worth if sold</th>
                      <th className="py-2 pr-3 text-right">Cargo tons</th>
                      <th className="py-2 pr-3 text-right">Storage cap</th>
                      <th className="py-2 pr-3 text-right">Ticks until full</th>
                      <th className="py-2 text-right">Credits per ton</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((it) => {
                      const meta = model.items?.[it.index];
                      return (
                        <tr key={it.index} className="border-b border-gray-900">
                          <td className="py-1.5 pr-3 text-gray-300">{it.name}</td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            <input
                              aria-label={`${it.name} rate`}
                              type="number"
                              min={0}
                              max={100}
                              value={rates[it.index]}
                              onChange={(e) =>
                                setRate(it.index, Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                              }
                              className="w-16 border border-gray-800 bg-black px-1 py-0.5 text-sm text-gray-100 focus:border-yellow-400 focus:outline-none"
                            />
                            {clampFor(it.index) && (
                              <span data-testid="row-clamped" className="ml-2 text-xs text-yellow-400">
                                → {clampFor(it.index)?.allowed}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-gray-100">{n(it.producedPerTick)}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-400">{n(it.creditsPerTick)}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-500">{n(it.tonsPerTick)}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-500">{n(it.capacity)}</td>
                          <td className={`py-1.5 pr-3 text-right ${it.atCapacity ? 'text-red-400' : 'text-gray-500'}`}>
                            {it.atCapacity ? 'full' : it.ticksToCapacity === null ? '—' : n(it.ticksToCapacity)}
                          </td>
                          <td className="py-1.5 text-right text-gray-500">
                            {meta && meta.tons > 0 ? n1(meta.baseprice / meta.tons) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-800 text-xs uppercase tracking-widest text-gray-500">
                      <td className="py-2 pr-3">Total</td>
                      <td data-testid="rate-total" className="py-2 pr-3 whitespace-nowrap text-gray-300">
                        {result.rateBudgetUsed} / 100
                        <span className="ml-2 text-gray-500">
                          {100 - result.rateBudgetUsed} left
                        </span>
                      </td>
                      <td colSpan={6} />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <ColumnKey />
              <Tips items={PRODUCTION_TIPS} />
            </>
          )}

          {result && !blank && tab === 'Survival' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Eaten each tick"
                  value={n(result.food.eatenPerTick)}
                  hint="One case per hundred people, colonists and troops alike."
                />
                <Stat
                  label="Grown each tick"
                  value={n(result.food.producedPerTick)}
                  hint="What your food rate makes every 6 hours."
                />
                <Stat
                  label="Net each tick"
                  value={`${result.food.netPerTick >= 0 ? '+' : ''}${n(result.food.netPerTick)}`}
                  hint="Below zero and the colony is living off its stores."
                  tone={result.food.netPerTick < 0 ? 'bad' : 'good'}
                />
                <Stat
                  label="Lowest food rate that feeds them"
                  value={String(result.food.minimumRate)}
                  hint="Feeds them and keeps the larder growing as fast as the colony. Break-even is not enough."
                />
              </div>
              <RateControl
                label="Food cases"
                value={rates[I_FOOD]}
                onChange={(v) => setRate(I_FOOD, v)}
                suggestion={result.food.minimumRate}
                onAdopt={() => setRate(I_FOOD, result.food.minimumRate)}
              />
              <p className={`mt-4 text-sm ${result.food.safe ? 'text-green-400' : 'text-red-400'}`}>
                {result.food.safe
                  ? `Fed. Starvation begins below ${n(result.food.starvationFloor)} cases in store.`
                  : `Not sustainable. Starvation begins below ${n(result.food.starvationFloor)} cases in store, and an eighth of the population dies the tick it happens.`}
              </p>
              {(result.starvedMen > 0 || result.starvedTroops > 0) && (
                <p className="mt-2 text-sm text-red-400">
                  On these numbers this tick kills {n(result.starvedMen)} colonists and{' '}
                  {n(result.starvedTroops)} troops.
                </p>
              )}
              <p className="mt-3 text-sm leading-relaxed text-gray-400">
                If that rate looks ruinous, it is because the colony is small. Food production scales
                with population but mouths are counted in whole hundreds, so a village spends a large
                share of its budget feeding itself. At scale the requirement settles at about{' '}
                <span className="text-gray-200">52.5 ÷ {result.fact.toFixed(2)}</span> ={' '}
                <span className="text-gray-200">{Math.ceil(52.5 / result.fact)}</span> and stays there
                no matter how large the colony grows.
              </p>
              <Tips items={SURVIVAL_TIPS} />
            </>
          )}

          {result && !blank && tab === 'Tax' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Tax collected each tick"
                  value={n(result.tax.perTick)}
                  hint="Yours to withdraw."
                  tone="good"
                />
                <Stat
                  label="Production lost to tax"
                  value={n(result.tax.goodsLostPerTick)}
                  hint="Every item the colony makes, valued at base price, that this rate costs you."
                />
                <Stat
                  label="Troops needed to stop a revolt"
                  value={n(result.tax.troopsToHoldOrder)}
                  hint="Meet it and the revolt roll never happens. Fall short and it is one tick in ten."
                  tone={result.tax.willRevolt ? 'bad' : undefined}
                />
                <Stat
                  label="Troop rate to keep pace"
                  value={n1(result.tax.sustainingTroopRate)}
                  hint="The garrison must grow with the population, or it drifts below the line."
                />
              </div>
              <p
                data-testid="tax-verdict"
                className={`mt-4 text-sm ${result.tax.worthwhile ? 'text-green-400' : 'text-gray-300'}`}
              >
                {result.taxrate === 0
                  ? 'Untaxed. No garrison is needed — the revolt check cannot fire at all at zero.'
                  : result.tax.worthwhile
                    ? 'This rate collects more than the production it costs.'
                    : 'This rate costs more than it collects. The production penalty applies to everything the colony makes, and the garrison and extra food come out of the same hundred points.'}
              </p>
              <p className="mt-2 text-sm text-gray-400">
                Tax collects into its own pool, separate from planet cash, and it is yours — land on
                the colony and <span className="text-gray-200">wit</span> moves it to your credits.
                Planet cash never can be.
              </p>
              {result.tax.willRevolt && (
                <p className="mt-2 text-sm text-red-400">
                  Your garrison is below the threshold — one tick in ten, this colony revolts and
                  you lose it.
                </p>
              )}
              <Tips items={TAX_TIPS} />
            </>
          )}

          {result && !blank && tab === 'Growth' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Growth each tick"
                  value={`${n1(result.growth.perTickPercent)}%`}
                  hint="Compounding — colonists are made in proportion to how many there already are."
                />
                <Stat
                  label="Population doubles in"
                  value={result.growth.doublingDays === null ? 'never' : `${n1(result.growth.doublingDays)} days`}
                  hint="Real days, at four ticks a day."
                />
                <Stat
                  label="Population ceiling"
                  value={n(result.growth.populationCap)}
                  hint="The most this colony will ever hold."
                />
                <Stat
                  label="Ceiling reached in"
                  value={result.growth.daysToCap === null ? '—' : `${n(result.growth.daysToCap)} days`}
                  hint="At the men rate set below."
                />
              </div>
              <RateControl label="Men" value={rates[I_MEN]} onChange={(v) => setRate(I_MEN, v)} />
              <p className="mt-4 text-sm text-gray-400">
                The ceiling moves with your production multiplier, so raising tax later lowers it —
                and anything above the new ceiling is clamped away on the next tick.
              </p>
              <Tips items={GROWTH_TIPS} />
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
