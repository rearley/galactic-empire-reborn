/**
 * The gate has to hold at the place that actually matters: whether the route is
 * mounted at all. `debugEndpointsEnabled` being correct is not enough if a
 * module forgets to call it — and one of them (`DebugController`, serving
 * `/debug/tick-stats`) was registered unconditionally, live in production.
 *
 * Module-level `controllers` arrays are evaluated at import time, so each case
 * resets the module registry and re-imports under a fresh environment.
 */
const MODULES: Array<{ path: string; controller: string }> = [
  { path: '../../../src/game/ship/ship.module', controller: 'ShipDebugController' },
  { path: '../../../src/game/droid/droid.module', controller: 'DroidDebugController' },
  { path: '../../../src/game/cybertron/cybertron.module', controller: 'CybertronDebugController' },
  { path: '../../../src/app.module', controller: 'DebugController' },
];

function controllersOf(modulePath: string, className: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const mod = require(modulePath) as Record<string, unknown>;
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
    jest.resetModules();
    process.env = { ...original };
    delete process.env['GE_DEBUG_ENDPOINTS'];
  });

  afterAll(() => {
    process.env = original;
  });

  it.each(MODULES)('$controller is absent with no configuration', ({ path, controller }) => {
    process.env['NODE_ENV'] = 'development';
    expect(controllersOf(path, controller)).not.toContain(controller);
  });

  it.each(MODULES)('$controller is absent in production even when switched on', ({ path, controller }) => {
    process.env['NODE_ENV'] = 'production';
    process.env['GE_DEBUG_ENDPOINTS'] = '1';
    expect(controllersOf(path, controller)).not.toContain(controller);
  });

  it.each(MODULES)('$controller is present when switched on outside production', ({ path, controller }) => {
    process.env['NODE_ENV'] = 'development';
    process.env['GE_DEBUG_ENDPOINTS'] = '1';
    expect(controllersOf(path, controller)).toContain(controller);
  });

  it('leaves the health check mounted regardless — it is not a debug route', () => {
    process.env['NODE_ENV'] = 'production';
    expect(controllersOf('../../../src/app.module', 'HealthController')).toContain('HealthController');
  });
});
