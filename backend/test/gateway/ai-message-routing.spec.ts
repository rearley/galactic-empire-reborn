/**
 * AI narration must reach the target exactly once, and through a room that exists.
 *
 * Two routing defects, both invisible to every existing test because they check
 * WHAT is emitted rather than WHERE:
 *
 *   1. The Cybertron taunt used two separate `.emit()` calls — `user:<target>`
 *      then `sector:x:y`. A target standing in the taunter's sector is in both
 *      rooms, so it received every taunt TWICE. Socket.io de-duplicates across
 *      rooms within ONE emit (`.to(a).to(b)`), not across two.
 *   2. The droid annoy addressed `to:<userid>:<shipno>` — a room nothing ever
 *      joins. Sockets join `user:<userid>` and `sector:x:y` and nothing else, so
 *      the targeted half of the delivery was dead; it survived only because a
 *      droid is usually in its victim's sector anyway.
 *
 * Canon sends both to one recipient: `outprfge(FILTER, usrn)`
 * (GECYBS.C:401-403, GEDROIDS.C:241-243). The sector copy is a port addition
 * and is kept, but it must not double up on the addressee.
 */
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';

type Emit = { rooms: string[]; event: string };

function build() {
  const emits: Emit[] = [];
  const gateway = makeGateway({ random: mockRandom });
  // `.except()` models Socket.io's exclusion list. The taunt path uses it to
  // drop pilots with `set filter on`; this double ignores WHO is excluded and
  // only has to keep the chain fluent. @see cybertron-taunt-filter.spec.ts
  const chain = (rooms: string[]) => ({
    to: (r: string) => chain([...rooms, r]),
    except: () => chain(rooms),
    emit: (event: string) => { emits.push({ rooms, event }); },
  });
  (gateway as unknown as { server: unknown }).server = { to: (r: string) => chain([r]) };
  return { gateway, emits };
}

describe('AI narration routing', () => {
  it('sends a Cybertron taunt in ONE emit, so the target does not hear it twice', () => {
    const { gateway, emits } = build();
    (gateway as unknown as { handleCybertronTaunt: (e: unknown) => void }).handleCybertronTaunt({
      attackerShipKey: 'Cybrg-1:1',
      targetShipKey: 'usr_abc:1',
      message: 'Prepare to die human!',
      sector: { x: 3, y: 4 },
      tickAt: 0,
    });

    expect(emits).toHaveLength(1);
    expect(emits[0].rooms).toEqual(['user:usr_abc', 'sector:3:4']);
  });

  it('addresses a droid annoy to a room sockets actually join', () => {
    const { gateway, emits } = build();
    (gateway as unknown as { handleDroidAnnoy: (e: unknown) => void }).handleDroidAnnoy({
      fromShipKey: '@Droid-1:1',
      fromShipname: 'Scow',
      toUserid: 'usr_abc',
      toShipno: 2,
      message: 'Cease fire!',
      sector: { x: 3, y: 4 },
      tickAt: 0,
      classNumber: 31,
      variant: 'help',
    });

    expect(emits).toHaveLength(1);
    // `user:<userid>` is the only per-captain room the gateway ever joins.
    expect(emits[0].rooms).toEqual(['user:usr_abc', 'sector:3:4']);
  });
});
