/**
 * Only CYBORG-class ships run Cybertron behaviour. Droids must not.
 *
 * Canon dispatches per CLASS, through a function pointer set at boot:
 *
 *     if (shipclass[i].max_type == CLASSTYPE_CYBORG) shipclass[i].tick_func = cyb_lives;
 *     else if (shipclass[i].max_type == CLASSTYPE_DROID) shipclass[i].tick_func = droid_lives;
 *     ...
 *     (*(shipclass[wptr->shpclass].tick_func))(wptr,zothusn);
 *
 * (GEMAIN.C:878-895, invoked at :2418-2419.) A droid NEVER runs cyb_lives.
 *
 * Our `onAiTick` filtered on `s.status === 2`, and droids spawn with
 * `status: GESTAT_AUTO` (=2) into the same in-memory map — so every droid ran
 * BOTH DroidTickService.actOnDroid and the full Cybertron brain: cyb wander,
 * pursuit bands, hyperwarp, taunts, torpedo volleys. Two services then
 * decremented and rewrote the same `ship.tick` countdown, so neither cadence
 * was the one its author wrote.
 *
 * Round 5 measured both halves of the consequence. Droids hunted like
 * predators — a class-32 transport killed one player three times across
 * sectors five apart — while `cybmine <> 255` returned ZERO on 112 consecutive
 * snapshots and no Cybertron killed anybody all round. `countClaims` counts
 * every status=2 ship, and canon droids never set `cybmine` at all
 * (it does not appear in GEDROIDS.C), so droids running Cybertron code can
 * take claims that lock the real Cybertrons out of a target: `noClaim` is 1
 * for an Interceptor, so one droid is enough.
 */
import { CybertronTickService } from '../../../src/game/cybertron/cybertron-tick.service';

describe('AI tick dispatch is by class, not by status', () => {
  it('selects only CPU_COMBATIVE ships, leaving droids to their own service', () => {
    const ships = [
      { userid: 'Cybrg-1', shipno: 1, shpclass: 21, status: 2 },
      { userid: 'Cybrg-2', shipno: 2, shpclass: 25, status: 2 },
      { userid: '@Droid-31-1', shipno: 31001, shpclass: 31, status: 2 },
      { userid: '@Droid-32-1', shipno: 32001, shpclass: 32, status: 2 },
      { userid: 'player', shipno: 1, shpclass: 1, status: 1 },
    ];
    const category: Record<number, string> = {
      1: 'PLAYER', 21: 'CPU_COMBATIVE', 25: 'CPU_COMBATIVE', 31: 'CPU_DROID', 32: 'CPU_DROID',
    };

    const svc = Object.create(CybertronTickService.prototype) as object;
    Object.assign(svc, {
      shipState: { findAllShips: () => ships },
      shipClassCache: { getCategory: (c: number) => category[c] },
    });

    const selected = (svc as { selectAiShips: () => Array<{ shpclass: number }> })
      .selectAiShips();

    expect(selected.map((s) => s.shpclass).sort((a, b) => a - b)).toEqual([21, 25]);
  });
});
