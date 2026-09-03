/**
 * `shi dn` answered with port-invented text.
 *
 * Canon's shielddn() is three statements and its only output is
 * `prfmsg(SHLDDN)`:
 *
 *   void FUNC shielddn(wptr,usrn)
 *   {
 *   usrn = usrn;
 *   prfmsg(SHLDDN);          <- "Shields are now down, Sir!"
 *   outprfge(FILTER,usrn);
 *   wptr->shieldstat = SHIELDDN;
 *   }
 *                                     GEFUNCS.C:2419-2427
 *   SHLDDN text                       MBMGEMSG.MSG:2302
 *
 * The port printed SHI_DN ("Shields down.") instead — an invention, and an
 * inconsistency inside one command: the sibling branch already prints canon's
 * SHLDCHP ("Shields energizing, Sir!") for `shi up` (GEFUNCS.C:2409-2415).
 * The same SHLDDN string is already what combat prints when firing drops your
 * shields (src/game/combat/shield-drop.ts), so before this fix the identical
 * event had two different wordings depending on how it was triggered.
 */

import { CommandResult, CommandContext } from '../../../../src/game/commands/command.types';
import { ShieldHandlerService } from '../../../../src/game/commands/handlers/shield.handler';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'T', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 3, shieldstat: 1, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    ...over,
  } as ShipState;
}

function makeHandler(maxShields = 10): ShieldHandlerService {
  const cache = { getMaxShields: () => maxShields } as unknown as ShipClassCacheService;
  return new ShieldHandlerService(cache);
}

function run(ship: ShipState, arg: string): CommandResult {
  const h = makeHandler();
  return h.command.handler(ship, [arg], {} as CommandContext) as CommandResult;
}

describe('`shi dn` prints canon SHLDDN (GEFUNCS.C:2419-2427)', () => {
  it.each(['dn', 'down'])('answers "Shields are now down, Sir!" for `shi %s`', (arg) => {
    const s = makeShip();
    const res = run(s, arg);
    expect(res.lines[0].text).toBe('Shields are now down, Sir!');
    expect(res.lines[0].text).toBe(formatMessage(MessageId.SHLDDN));
    expect(s.shieldstat).toBe(0);
    expect(s.dirty).toBe(true);
  });

  it('uses the same wording as a combat-triggered shield drop', () => {
    // src/game/combat/shield-drop.ts emits SHLDDN for the same event.
    expect(run(makeShip(), 'dn').lines[0].text).toBe(formatMessage(MessageId.SHLDDN));
  });

  it('no longer prints the invented "Shields down."', () => {
    expect(run(makeShip(), 'dn').lines[0].text).not.toBe(formatMessage(MessageId.SHI_DN));
  });
});
