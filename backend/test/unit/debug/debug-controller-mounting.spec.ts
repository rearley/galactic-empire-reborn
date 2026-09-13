/**
 * The gate has to hold at the place that actually matters: whether the route is
 * mounted at all. `debugEndpointsEnabled` being correct is not enough if a
 * module forgets to call it — and one of them (`DebugController`, serving
 * `/debug/tick-stats`) was registered unconditionally, live in production.
 *
 * Module-level `controllers` arrays are evaluated at import time, so each case
 * resets the module registry and re-imports under a fresh environment.
 */
/**
 * Each entry carries a LOADER rather than a path string.
 *
 * The specifier has to be a literal so the bundler can see it: a
 * `require(variable)` is not statically analysable, and under Vitest it fails
 * at run time with "Cannot find module" even though the path is correct. A
 * thunk per module keeps the table readable and keeps every specifier literal.
 */
const MODULES: Array<{ load: () => Promise<Record<string, unknown>>; controller: string }> = [
  { load: () => import('../../../src/game/ship/ship.module'), controller: 'ShipDebugController' },
  { load: () => import('../../../src/game/droid/droid.module'), controller: 'DroidDebugController' },
  {
    load: () => import('../../../src/game/cybertron/cybertron.module'),
    controller: 'CybertronDebugController',
  },
  { load: () => import('../../../src/app.module'), controller: 'DebugController' },
];

async function controllersOf(
  load: () => Promise<Record<string, unknown>>,
  className: string,
): Promise<string[]> {
  const mod = await load();
  const exported = Object.values(mod).find(
    (v) => typeof v === 'function' && Reflect.getMetadata('controllers', v as object) !== undefined,
  );
  const list = (Reflect.getMetadata('controllers', exported as object) ?? []) as Array<{ name: string }>;
  void className;
  return list.map((c) => c.name);
}

describe('debug controllers are mounted only when explicitly enabled', () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...original };
    delete process.env['GE_DEBUG_ENDPOINTS'];
  });

  afterAll(() => {
    process.env = original;
  });

  it.each(MODULES)('$controller is absent with no configuration', async ({ load, controller }) => {
    process.env['NODE_ENV'] = 'development';
    expect(await controllersOf(load, controller)).not.toContain(controller);
  });

  it.each(MODULES)(
    '$controller is absent in production even when switched on',
    async ({ load, controller }) => {
      process.env['NODE_ENV'] = 'production';
      process.env['GE_DEBUG_ENDPOINTS'] = '1';
      expect(await controllersOf(load, controller)).not.toContain(controller);
    },
  );

  it.each(MODULES)(
    '$controller is present when switched on outside production',
    async ({ load, controller }) => {
      process.env['NODE_ENV'] = 'development';
      process.env['GE_DEBUG_ENDPOINTS'] = '1';
      expect(await controllersOf(load, controller)).toContain(controller);
    },
  );

  it('leaves the health check mounted regardless — it is not a debug route', async () => {
    process.env['NODE_ENV'] = 'production';
    expect(
      await controllersOf(() => import('../../../src/app.module'), 'HealthController'),
    ).toContain('HealthController');
  });
});
