import { AdminHandlerService } from '../../src/game/commands/handlers/admin.handler';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../src/game/constants/items';
import { MAXPLNTS } from '../../src/game/constants';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

/**
 * Claiming a planet belongs to `adm`, not to a command of our own invention.
 *
 * C has no `land` — the full table in GECMDS.C:122 is 47 commands and none of
 * them is it. You orbit an unclaimed world, type `adm`, and it offers:
 *   mnu_admenu1  — "do you wish to claim this planet" (y/n)
 *   mnu_admenu1a — "enter the name of the new planet"
 * then drops you into the admin menu (GEMAIN.C:2899-2981).
 *
 * This port invented `land` to do the same job and never implemented the adm
 * branch, so `adm` refused every planet you did not already own. The invented
 * command then grew two defects of its own — a team lock that admitted
 * strangers, and a docking concept C does not have.
 */
function makeShip(o: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'usr_me',
    shipname: 'Probe',
    xcoord: 3.5,
    ycoord: 4.5,
    where: 11,
    items: Array(NUMITEMS).fill(0n) as bigint[],
    ...o,
  });
}

function makeService(
  planetUserid: string | null,
  claimResult: unknown = { ok: true },
) {
  const claim = jest.fn().mockResolvedValue(claimResult);
  const planetService = {
    get: jest.fn().mockReturnValue({
      xsect: 3, ysect: 4, plnum: 1, userid: planetUserid, name: planetUserid ? 'Held' : '',
      cash: 0n, tax: 0n, taxrate: 0, password: '', teamcode: 0n,
      items: Array.from({ length: NUMITEMS }, () => ({
        qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
      })),
    }),
    claim,
    applyAdminChange: jest.fn().mockResolvedValue({ ok: true }),
  } as unknown as PlanetStateService;
  return { svc: new AdminHandlerService(planetService), claim };
}

describe('adm on an unclaimed planet — C\'s claim flow', () => {
  it('offers the planet rather than refusing it', async () => {
    const { svc, claim } = makeService(null);
    const r = await svc.command.handler(makeShip(), [], {}) as
      { lines: { text: string }[]; expectFollowup?: string };
    expect(r.lines[0].text).toBe(formatMessage(MessageId.ADM_CLAIM_OFFER));
    expect(r.expectFollowup).toBe('adm');
    expect(claim).not.toHaveBeenCalled();
  });

  it('asks for a name once you accept', async () => {
    const { svc, claim } = makeService(null);
    const r = await svc.command.handler(makeShip(), ['yes'], {}) as
      { lines: { text: string }[]; expectFollowup?: string };
    expect(r.lines[0].text).toBe(formatMessage(MessageId.LAND_NAME_PROMPT));
    expect(r.expectFollowup).toBe('adm claim');
    expect(claim).not.toHaveBeenCalled();
  });

  it('claims it under the name you give', async () => {
    const { svc, claim } = makeService(null);
    const r = await svc.command.handler(makeShip(), ['claim', 'New', 'Terra'], {}) as
      { lines: { text: string }[] };
    expect(claim).toHaveBeenCalledWith(3, 4, 1, 'usr_me', 'New Terra');
    // ADMENU1B names four things: planet number, new name, commander, ship
    // (GEMAIN.C:2966-2970). Passing only the name left three holes in the
    // declaration — "planet New Terra to be named  ... Commander of The ."
    expect(r.lines[0].text).toBe(
      formatMessage(MessageId.LAND_CLAIMED, 1, 'New Terra', 'usr_me', 'Probe'),
    );
  });

  it('walks away when you decline', async () => {
    const { svc, claim } = makeService(null);
    const r = await svc.command.handler(makeShip(), ['no'], {}) as { lines: { text: string }[] };
    expect(r.lines[0].text).toBe(formatMessage(MessageId.ADM_CLAIM_DECLINED));
    expect(claim).not.toHaveBeenCalled();
  });

  it('refuses a name that is not usable', async () => {
    const { svc, claim } = makeService(null);
    const r = await svc.command.handler(makeShip(), ['claim', 'A'.repeat(20)], {}) as
      { lines: { text: string }[] };
    expect(r.lines[0].text).toBe(formatMessage(MessageId.LAND_INVALID_NAME));
    expect(claim).not.toHaveBeenCalled();
  });

  it('still refuses a planet someone else holds', async () => {
    const { svc } = makeService('usr_other');
    const r = await svc.command.handler(makeShip(), [], {}) as { lines: { text: string }[] };
    expect(r.lines[0].text).toBe(formatMessage(MessageId.ADM_NOT_OWNER));
  });

  /**
   * Coverage moved here from the deleted `land` handler: the per-captain
   * planet cap (GECMDS.C:3487 `if (waruptr->planets >= max_plnts)`) and the
   * neutral-zone refusal must survive the move to `adm`.
   */
  it('reports the per-captain planet cap rather than claiming anyway', async () => {
    const { svc } = makeService(null, { ok: false, reason: 'PLANET_LIMIT' });
    const r = await svc.command.handler(makeShip(), ['claim', 'Overreach'], {}) as
      { lines: { text: string }[] };
    expect(r.lines[0].text).toBe(formatMessage(MessageId.LAND_PLANET_LIMIT, String(MAXPLNTS)));
  });

  it('refuses to claim a neutral-zone trading post', async () => {
    const { svc } = makeService(null, { ok: false, reason: 'NEUTRAL_ZONE' });
    const r = await svc.command.handler(makeShip(), ['claim', 'MyZygor'], {}) as
      { lines: { text: string }[] };
    expect(r.lines[0].text).toBe(formatMessage(MessageId.LAND_NEUTRAL_ZONE));
  });

  it('refuses when not in orbit at all', async () => {
    const { svc, claim } = makeService(null);
    const r = await svc.command.handler(makeShip({ where: 0 }), [], {}) as
      { lines: { text: string }[] };
    expect(r.lines[0].text).toBe(formatMessage(MessageId.ADM_NOT_LANDED));
    expect(claim).not.toHaveBeenCalled();
  });
});
