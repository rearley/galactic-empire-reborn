/**
 * `shi up` has five preconditions in C, and the port had none of them —
 * it set `shieldstat = 1` unconditionally.
 *
 * GECMDS.C:3114-3170, in order:
 *
 *   shipclass[shpclass].max_shlds == 0  -> SHIELD0  no generator fitted
 *   warsptr->where == 1                 -> SHLD1    in hyperspace
 *   warsptr->shieldtype == 0            -> SHLD2    no shields installed
 *   energy <= SHMINPWR                  -> SHNOPWR  not enough power
 *   shieldstat == SHIELDDM              -> SHNORPR  blown, needs repair
 *
 * The last one is the load-bearing gate: without it a pilot whose shields had
 * just been blown could type `shi up` and be fully protected again on the next
 * tick, which is what made sustained phaser pressure pointless.
 *
 * `shi down` has none of these gates — shielddn() is called directly, and its
 * only output is prfmsg(SHLDDN) = "Shields are now down, Sir!"
 * (GEFUNCS.C:2419-2427, MBMGEMSG.MSG:2302).
 */

import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { ShieldHandlerService } from '../../../../src/game/commands/handlers/shield.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { SHIELDDM, SHMINPWR } from '../../../../src/game/constants';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 3, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: -1, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  };
}

function makeHandler(maxShields = 3): ShieldHandlerService {
  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, {
    maxAcceleration: 1000, maxWarp: 10, maxPhaser: 1000,
    scanRange: 15000, maxTons: 5000, maxShields,
  } as never);
  return new ShieldHandlerService(cache);
}

const ctx: CommandContext = {};

function run(ship: ShipState, arg: string, maxShields = 3): CommandResult {
  return makeHandler(maxShields).command.handler(ship, [arg], ctx) as CommandResult;
}

// `shi up` prints SHLDCHP ("Shields energizing, Sir!"), not "Shields up.":
// canon's shieldup() is three statements whose only output is prfmsg(SHLDCHP)
// (GEFUNCS.C:2409-2415). Shields take ~100s to fill, so "up" would claim
// protection the pilot does not yet have.
describe('`shi up` gates — GECMDS.C:3114-3170', () => {
  it('raises shields when every precondition holds', () => {
    const s = makeShip();
    expect(run(s, 'up').lines[0].text).toBe(formatMessage(MessageId.SHLDCHP));
    expect(s.shieldstat).toBe(1);
  });

  it('refuses on a hull with no shield generator (SHIELD0)', () => {
    const s = makeShip();
    expect(run(s, 'up', 0).lines[0].text).toBe(formatMessage(MessageId.SHIELD0));
    expect(s.shieldstat).toBe(0);
  });

  it('refuses in hyperspace (SHLD1)', () => {
    const s = makeShip({ where: 1 });
    expect(run(s, 'up').lines[0].text).toBe(formatMessage(MessageId.SHLD1));
    expect(s.shieldstat).toBe(0);
  });

  it('refuses with no shields installed (SHLD2)', () => {
    const s = makeShip({ shieldtype: 0 });
    expect(run(s, 'up').lines[0].text).toBe(formatMessage(MessageId.SHLD2));
    expect(s.shieldstat).toBe(0);
  });

  it('refuses at or below SHMINPWR energy (SHNOPWR)', () => {
    const s = makeShip({ energy: SHMINPWR });
    expect(run(s, 'up').lines[0].text).toBe(formatMessage(MessageId.SHNOPWR));
    expect(s.shieldstat).toBe(0);
  });

  it('refuses to re-raise a blown shield (SHNORPR)', () => {
    // The gate that makes sustained fire worth anything.
    const s = makeShip({ shieldstat: SHIELDDM });
    expect(run(s, 'up').lines[0].text).toBe(formatMessage(MessageId.SHNORPR));
    expect(s.shieldstat).toBe(SHIELDDM);
  });
});

describe('`shi dn` has no gates — shielddn() is called directly', () => {
  it('lowers shields even in hyperspace with a blown generator', () => {
    const s = makeShip({ where: 1, shieldstat: SHIELDDM, shieldtype: 0 });
    // SHLDDN, not the port's invented SHI_DN. @see GEFUNCS.C:2419-2427 shielddn
    expect(run(s, 'dn', 0).lines[0].text).toBe(formatMessage(MessageId.SHLDDN));
    expect(s.shieldstat).toBe(0);
    expect(s.dirty).toBe(true);
  });

  it('accepts the long form "down"', () => {
    const s = makeShip({ shieldstat: 1 });
    run(s, 'down');
    expect(s.shieldstat).toBe(0);
  });
});

describe('`shi` argument handling', () => {
  it('an unknown subcommand returns the format line and changes nothing', () => {
    const s = makeShip({ shieldstat: 1 });
    expect(run(s, 'bogus').lines[0].text).toBe(formatMessage(MessageId.SHI_FMT));
    expect(s.shieldstat).toBe(1);
  });

  it('keeps the keyword and alias', () => {
    expect(makeHandler().command.keyword).toBe('shi');
    expect(makeHandler().command.aliases).toEqual(['shield']);
  });
});
