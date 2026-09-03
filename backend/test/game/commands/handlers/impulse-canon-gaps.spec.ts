import { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import {
  impulseCommand,
  IMPULSE1,
  CLOK3,
  cloakIonTrailReports,
  setIonTrailObserverSource,
} from '../../../../src/game/commands/handlers/impulse.handler';
import { ShipState } from '../../../../src/game/ship/ship-state.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 270, head2b: 270, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  } as ShipState;
}

const ctx: CommandContext = {};

/* ------------------------------------------------------------------ */
/* (a) IMPULSE1 — the hyperspace gate                                  */
/* @see GECMDS.C:495-500 cmd_impulse                                   */
/* @see GE/REL/MBMGEMSG.MSG:2900                                       */
/* ------------------------------------------------------------------ */
describe('IMPULSE1 — impulse is refused in hyperspace', () => {
  it('carries the canon wording', () => {
    expect(IMPULSE1).toBe('Sorry Sir! Impulse drives would be useless in Hyperspace!');
  });

  it('where === 1 refuses the order and changes nothing', () => {
    const ship = makeShip({ where: 1, percent: 0, speed2b: 0, head2b: 270 });
    const result = impulseCommand.handler(ship, ['50', '90'], ctx) as CommandResult;

    expect(result.lines).toEqual([{ text: IMPULSE1, category: 'system' }]);
    expect(ship.percent).toBe(0);
    expect(ship.speed2b).toBe(0);
    expect(ship.head2b).toBe(270);
  });

  it('gates BEFORE argument validation — C checks where==1 first (GECMDS.C:495)', () => {
    const ship = makeShip({ where: 1 });
    const result = impulseCommand.handler(ship, ['nonsense'], ctx) as CommandResult;
    expect(result.lines[0].text).toBe(IMPULSE1);
  });

  it('where === 0 is unaffected', () => {
    const ship = makeShip({ where: 0 });
    const result = impulseCommand.handler(ship, ['50'], ctx) as CommandResult;
    expect(result.lines[0].text).not.toBe(IMPULSE1);
    expect(ship.percent).toBe(50);
  });

  it('where >= 10 (in orbit) is NOT the hyperspace gate — orbit is left instead', () => {
    const ship = makeShip({ where: 12, repair: 5 });
    const result = impulseCommand.handler(ship, ['50'], ctx) as CommandResult;
    expect(result.lines.some((l) => l.text === IMPULSE1)).toBe(false);
    expect(ship.where).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* (b) CLOK3 — the cloak ion trail                                     */
/* @see GECMDS.C:524-546 cmd_impulse                                   */
/* @see GE/REL/MBMGEMSG.MSG:2390-2392                                  */
/* ------------------------------------------------------------------ */
describe('CLOK3 — cloaked impulse leaks an ion trail', () => {
  const mover = {
    userid: 'u1', shipno: 1,
    xcoord: 10, ycoord: 10,
    cloak: 10, speed2b: 900,
  };

  /** Observer due NORTH of the mover, heading north (0) — the mover bears 180. */
  function observer(overrides: Partial<{
    userid: string; shipno: number; xcoord: number; ycoord: number;
    heading: number; jammer: number; scanrange: number;
  }> = {}) {
    return {
      userid: 'u2', shipno: 1,
      xcoord: 10, ycoord: 9.5,
      heading: 0, jammer: 0, scanrange: 100_000,
      ...overrides,
    };
  }

  /** Deterministic stand-in for GELIB.C rndm()/gernd(). */
  const rng = (rndmValue: number, gernd: number) => ({
    rndm: (mod: number) => rndmValue * (mod / 200),
    gernd: () => gernd,
  });

  it('CLOK3 carries the canon wording', () => {
    expect(CLOK3).toBe('Sensors indicate some background ion field displacement bearing %d, Sir!');
  });

  it('reports to the OTHER captain, not the cloaked pilot', () => {
    const out = cloakIonTrailReports(mover, [observer()], rng(0, 10));
    expect(out).toHaveLength(1);
    expect(out[0].userid).toBe('u2');
    expect(out[0].shipno).toBe(1);
    expect(out[0].text).toBe(
      'Sensors indicate some background ion field displacement bearing 180, Sir!',
    );
  });

  it('never reports the mover to itself', () => {
    const self = observer({ userid: 'u1', shipno: 1 });
    expect(cloakIonTrailReports(mover, [self], rng(0, 10))).toEqual([]);
  });

  it('bearing is measured FROM the observer, relative to the OBSERVER heading', () => {
    // Same geometry, but the observer is now heading south (180) — the mover is
    // dead ahead of them, so the same contact reads 0 instead of 180.
    const out = cloakIonTrailReports(mover, [observer({ heading: 180 })], rng(0, 10));
    expect(out[0].bearing).toBe(0);
  });

  it('slops the bearing by gernd()%20 - 10 (GECMDS.C:540)', () => {
    expect(cloakIonTrailReports(mover, [observer()], rng(0, 0))[0].bearing).toBe(170);
    expect(cloakIonTrailReports(mover, [observer()], rng(0, 19))[0].bearing).toBe(189);
    expect(cloakIonTrailReports(mover, [observer()], rng(0, 30))[0].bearing).toBe(180);
  });

  it('only a FULLY cloaked ship (cloak === 10) leaks', () => {
    for (const cloak of [0, 1, 2, 9, -1]) {
      expect(cloakIonTrailReports({ ...mover, cloak }, [observer()], rng(0, 10))).toEqual([]);
    }
    expect(cloakIonTrailReports({ ...mover, cloak: 10 }, [observer()], rng(0, 10))).toHaveLength(1);
  });

  it('speed2b must EXCEED rndm(200) + 10', () => {
    // rndm → 0, threshold 10.
    expect(cloakIonTrailReports({ ...mover, speed2b: 10 }, [observer()], rng(0, 10))).toEqual([]);
    expect(cloakIonTrailReports({ ...mover, speed2b: 11 }, [observer()], rng(0, 10))).toHaveLength(1);
    // rndm → 199.999…, threshold ~209.999. imp 21 (speed2b 210) still leaks.
    expect(cloakIonTrailReports({ ...mover, speed2b: 200 }, [observer()], rng(199.99, 10))).toEqual([]);
    expect(cloakIonTrailReports({ ...mover, speed2b: 210 }, [observer()], rng(199.99, 10))).toHaveLength(1);
  });

  it('rolls rndm ONCE for the whole broadcast, not per observer', () => {
    let calls = 0;
    const counting = { rndm: () => { calls++; return 0; }, gernd: () => 10 };
    cloakIonTrailReports(mover, [observer(), observer({ userid: 'u3' }), observer({ userid: 'u4' })], counting);
    expect(calls).toBe(1);
  });

  it('range is scanrange/2, in raw units (cdistance x 10_000)', () => {
    // scanrange 100_000 → half is 50_000 → 5.0 sector-units of cdistance.
    const near = observer({ ycoord: 10 - 4.9 });   // 49_000 raw
    const far = observer({ userid: 'u3', ycoord: 10 - 5.1 }); // 51_000 raw
    const out = cloakIonTrailReports(mover, [near, far], rng(0, 10));
    expect(out.map((r) => r.userid)).toEqual(['u2']);
  });

  it('a jammer blanks the observer out entirely', () => {
    expect(cloakIonTrailReports(mover, [observer({ jammer: 1 })], rng(0, 10))).toEqual([]);
  });

  it('the audience is distance-bounded, NOT sector-bounded', () => {
    // Different integer sector, but inside scanrange/2 → still hears it.
    const acrossTheLine = observer({ xcoord: 10, ycoord: 7.5 });
    expect(cloakIonTrailReports({ ...mover, xcoord: 10, ycoord: 10 }, [acrossTheLine], rng(0, 10)))
      .toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* CLOK3 delivery through the command handler                          */
/* ------------------------------------------------------------------ */
describe('impulseCommand delivers CLOK3 to individual captains', () => {
  afterEach(() => setIonTrailObserverSource(null));

  it('emits nothing when no observer source is installed', () => {
    const ship = makeShip({ cloak: 10, xcoord: 10, ycoord: 10 });
    const result = impulseCommand.handler(ship, ['90'], ctx) as CommandResult;
    expect(result.broadcasts).toBeUndefined();
  });

  it('broadcasts to the listener user room, not the sector room', () => {
    setIonTrailObserverSource(() => [
      { userid: 'u2', shipno: 1, xcoord: 10, ycoord: 9.5, heading: 0, jammer: 0, scanrange: 100_000 },
    ]);
    const ship = makeShip({ cloak: 10, xcoord: 10, ycoord: 10 });
    const result = impulseCommand.handler(ship, ['99'], ctx) as CommandResult;

    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts![0].room).toBe('user:u2');
    expect(result.broadcasts![0].room).not.toMatch(/^sector:/);
    expect(String((result.broadcasts![0].payload as { text: string }).text))
      .toMatch(/^Sensors indicate some background ion field displacement bearing -?\d+, Sir!$/);
    // The cloaked captain's own lines say nothing about being detected.
    expect(result.lines.some((l) => l.text.includes('ion field'))).toBe(false);
  });

  it('an uncloaked ship at the same speed leaks nothing', () => {
    setIonTrailObserverSource(() => [
      { userid: 'u2', shipno: 1, xcoord: 10, ycoord: 9.5, heading: 0, jammer: 0, scanrange: 100_000 },
    ]);
    const ship = makeShip({ cloak: 0, xcoord: 10, ycoord: 10 });
    const result = impulseCommand.handler(ship, ['99'], ctx) as CommandResult;
    expect(result.broadcasts).toBeUndefined();
  });
});
