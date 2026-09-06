/**
 * Arriving in the galaxy, and leaving it, are announced.
 *
 *   if (warsptr->cloak != 10) {
 *       prfmsg(ANNOUN,shipclass[warsptr->shpclass].typename, warsptr->shipname);
 *       outwar(FILTER,usrnum,0);                     // the whole galaxy
 *   }
 *   ...
 *   if (warsptr->cloak != 10) {
 *       prfmsg(ENTWAR, shipclass[warsptr->shpclass].typename, warsptr->shipname);
 *       outsect(FILTER,&warsptr->coord,usrnum,0);    // this star system
 *   }
 *
 * @see GEFUNCS.C:153-175 tossingegame
 *
 *   prfmsg(WARHUP,username(warsptr));
 *   outsect(ALWAYS,&warsptr->coord,usrnum,0);
 *
 * @see GEMAIN.C:1425-1427 warhupa, the CLEAN-logoff arm
 *
 * None of the three was emitted, so the galaxy was silent about who was in it:
 * a captain could arrive in your sector, or vanish from it, with nothing on
 * your log either way. That matters most for the departure — a ship blinking
 * out of your scan with no line is indistinguishable from one that cloaked.
 *
 * Three routing rules are load-bearing and each has a test:
 *  - ANNOUN is galaxy-wide, ENTWAR is sector-scoped. Sending both everywhere
 *    would double every arrival.
 *  - both are FILTER, so a pilot with `set filter on` is skipped; WARHUP is
 *    ALWAYS and reaches them regardless.
 *  - a fully cloaked ship (cloak == 10) announces neither.
 */
import { GameGateway } from '../../src/gateway/game.gateway';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';

interface Emit { rooms: string[]; except: string[]; event: string; payload: unknown }

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'usr_pilot', shipno: 1, shipname: 'Falcon', shpclass: 1,
    username: 'Rick', xcoord: 12.5, ycoord: 7.5, cloak: 0, msgFilter: false,
    status: 1,
    ...over,
  } as ShipState;
}

function build(others: ShipState[] = []) {
  const emits: Emit[] = [];
  const chain = (rooms: string[], except: string[]) => ({
    to: (r: string) => chain([...rooms, r], except),
    except: (e: string[]) => chain(rooms, [...except, ...e]),
    emit: (event: string, payload: unknown) => { emits.push({ rooms, except, event, payload }); },
  });
  const shipState = { findAllShips: () => others } as unknown as ShipStateService;
  const cache = new ShipClassCacheService({} as never);
  cache.setForTest(1, { typeName: 'Interceptor' } as never);

  const gateway = new GameGateway(
    shipState, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, cache, {} as never,
    { emit: jest.fn(), on: jest.fn() } as never,
  );
  (gateway as unknown as { server: unknown }).server = {
    to: (r: string) => chain([r], []),
    except: (e: string[]) => chain([], e),
  };
  return { gateway, emits };
}

const arrive = (g: GameGateway, s: ShipState) =>
  (g as unknown as { announceArrival: (s: ShipState) => void }).announceArrival(s);
const depart = (g: GameGateway, s: ShipState) =>
  (g as unknown as { announceDeparture: (s: ShipState) => void }).announceDeparture(s);

describe('arrival (GEFUNCS.C:158, :167)', () => {
  it('sends ANNOUN to the galaxy and ENTWAR to the sector', () => {
    const { gateway, emits } = build();

    arrive(gateway, makeShip());

    expect(emits.map((e) => e.payload)).toEqual([
      { category: 'system', text: formatMessage(MessageId.ARRIVE_GALAXY, 'Interceptor', 'Falcon') },
      { category: 'system', text: formatMessage(MessageId.ARRIVE_SECTOR, 'Interceptor', 'Falcon') },
    ]);
    expect(emits[1].rooms).toEqual(['sector:12:7']);
  });

  it('does not send the arriving captain their own announcement', () => {
    const { gateway, emits } = build();

    arrive(gateway, makeShip());

    for (const e of emits) expect(e.except).toContain('user:usr_pilot');
  });

  it('skips a pilot who has set filter on — both lines are FILTER', () => {
    const quiet = { userid: 'usr_quiet', shipno: 1, msgFilter: true } as ShipState;
    const { gateway, emits } = build([quiet]);

    arrive(gateway, makeShip());

    for (const e of emits) expect(e.except).toContain('user:usr_quiet');
  });

  it('says nothing at all for a fully cloaked ship', () => {
    const { gateway, emits } = build();

    arrive(gateway, makeShip({ cloak: 10 }));

    expect(emits).toHaveLength(0);
  });

  it('still announces a partially cloaked ship — canon tests == 10, not > 0', () => {
    const { gateway, emits } = build();

    arrive(gateway, makeShip({ cloak: 9 }));

    expect(emits).toHaveLength(2);
  });
});

describe('departure (GEMAIN.C:1425)', () => {
  it('tells the sector the ship vanished, naming the commander', () => {
    const { gateway, emits } = build();

    depart(gateway, makeShip());

    expect(emits).toHaveLength(1);
    expect(emits[0].rooms).toEqual(['sector:12:7']);
    expect(emits[0].payload).toEqual({
      category: 'system',
      text: formatMessage(MessageId.DEPART_SECTOR, 'Rick'),
    });
  });

  it('reaches a pilot with filter on, because WARHUP is ALWAYS', () => {
    const quiet = { userid: 'usr_quiet', shipno: 1, msgFilter: true } as ShipState;
    const { gateway, emits } = build([quiet]);

    depart(gateway, makeShip());

    expect(emits[0].except).not.toContain('user:usr_quiet');
  });

  it('announces a cloaked ship leaving — canon gates only the ARRIVAL on cloak', () => {
    // warhupa has no cloak test (GEMAIN.C:1420-1430). A cloaked ship that logs
    // off still leaves the sector, and canon still says so.
    const { gateway, emits } = build();

    depart(gateway, makeShip({ cloak: 10 }));

    expect(emits).toHaveLength(1);
  });
});
