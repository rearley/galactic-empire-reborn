import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { NewShipHandlerService } from '../../src/game/commands/handlers/new-ship.handler';
import { ReportHandlerService } from '../../src/game/commands/handlers/report.handler';

/**
 * An `@Optional()` dependency that nothing provides resolves to `undefined`,
 * and the feature it serves goes quiet instead of failing.
 *
 * This repo has been bitten by that twice. `PhysicsTickService` took `RANDOM`
 * optionally, `PhysicsModule` provided none, and the warp-boundary missile
 * shake — guarded by `&& this.random` — never fired once in the live game. The
 * scan handler's own constructor carries a comment saying as much, directly
 * above three optional parameters added since.
 *
 * The stakes are higher for the class cache than for a shake. Absent it,
 * `ScanHandlerService` reads every ship's scan range as 0, so a scan finds
 * nothing; `NewShipHandlerService` lists no hulls and answers "Invalid ship
 * class" to every purchase; `ReportHandlerService` prints "Class 3" where a
 * type name belongs. All three are silent: no exception, no log line, nothing
 * that a suite of hand-constructed doubles can see, because a double supplies
 * the cache the container might not.
 *
 * So this boots the REAL container and asserts the wiring, which is the only
 * place the question is asked. `@Optional()` means "a harness may omit it",
 * never "production may".
 * @see src/game/physics/physics.module.ts — the RANDOM comment
 */
describe('optional dependencies resolve in the real container', () => {
  /** Reach a private field without widening the class's surface for a test. */
  const dep = (service: object, name: string): unknown =>
    (service as unknown as Record<string, unknown>)[name];

  it('gives the three command handlers their ship-class cache', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    try {
      expect(dep(moduleRef.get(ScanHandlerService), 'shipClassCache')).toBeDefined();
      expect(dep(moduleRef.get(NewShipHandlerService), 'shipClassCache')).toBeDefined();
      expect(dep(moduleRef.get(ReportHandlerService), 'shipClassCache')).toBeDefined();
    } finally {
      // close() whatever the assertions do, so the real setInterval timers the
      // tick service opened are cleared rather than leaked into later specs.
      await moduleRef.close();
    }
  });
});
