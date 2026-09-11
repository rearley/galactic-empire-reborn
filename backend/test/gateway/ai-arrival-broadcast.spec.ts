/**
 * A new Cybertron or droid entering the galaxy is announced to everyone.
 *
 *   prfmsg(CYBNEW,gernd()%359);      outwar(FILTER,usrn,0);   // GECYBS.C:186
 *   prfmsg(DROIDNEW,gernd()%359);    outwar(FILTER,usrn,0);   // GEDROIDS.C:173
 *
 * `outwar` is the whole galaxy, FILTER class — so `set filter on` silences it.
 *
 * The bearing is `gernd()%359`, a RANDOM number with no relationship to where
 * the ship actually is. That is deliberate in canon: the line is a sensor
 * contact, not a fix, and hunting the announced bearing is meant to be futile.
 * Passing the real bearing would turn a piece of atmosphere into a tracker.
 *
 * The port emitted structured spawn events for the frontend roster and no
 * player-visible line at all, so Cybertrons — the game's escalating threat —
 * arrived in complete silence.
 */
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { Random } from '../../src/game/combat/random.port';
import { CybertronSpawnedPayload } from '../../src/game/cybertron/cybertron-events';
import { DroidSpawnedEvent } from '../../src/game/droid/droid-events';
import { makeGateway } from '../helpers/make-gateway';

interface Emit { rooms: string[]; except: string[]; event: string; payload: unknown }

function build(others: ShipState[] = [], roll = 0.5) {
  const emits: Emit[] = [];
  const chain = (rooms: string[], except: string[]) => ({
    to: (r: string) => chain([...rooms, r], except),
    except: (e: string[]) => chain(rooms, [...except, ...e]),
    emit: (event: string, payload: unknown) => { emits.push({ rooms, except, event, payload }); },
  });
  const shipState = { findAllShips: () => others } as unknown as ShipStateService;
  const gateway = makeGateway({
    shipStateService: shipState,
    random: { next: () => roll } as unknown as Random,
  });
  (gateway as unknown as { server: unknown }).server = {
    to: (r: string) => chain([r], []),
    except: (e: string[]) => chain([], e),
    emit: (event: string, payload: unknown) => { emits.push({ rooms: [], except: [], event, payload }); },
  };
  return { gateway, emits };
}

const cybPayload: CybertronSpawnedPayload = {
  shipKey: 'Cybrg-200:200', classNumber: 21,
  sector: { x: 4, y: 9 }, tickAt: 0,
};
const droidPayload = {
  shipKey: 'Droid-1:201', classNumber: 33,
  sector: { x: 4, y: 9 }, tickAt: 0,
} as unknown as DroidSpawnedEvent;

const logLines = (emits: Emit[]) => emits.filter((e) => e.event === 'event.log');

describe('CYBNEW — a Cybertron enters the galaxy (GECYBS.C:186)', () => {
  it('is broadcast galaxy-wide, not to the spawn sector', () => {
    const { gateway, emits } = build();

    (gateway as unknown as { handleCybertronSpawned: (e: unknown) => void })
      .handleCybertronSpawned(cybPayload);

    const line = logLines(emits)[0];
    expect(line.rooms).toEqual([]);
    expect(line.payload).toMatchObject({ category: 'combat' });
  });

  it('skips pilots who have set filter on — outwar is FILTER class', () => {
    const quiet = { userid: 'usr_quiet', shipno: 1, msgFilter: true } as ShipState;
    const { gateway, emits } = build([quiet]);

    (gateway as unknown as { handleCybertronSpawned: (e: unknown) => void })
      .handleCybertronSpawned(cybPayload);

    expect(logLines(emits)[0].except).toContain('user:usr_quiet');
  });

  it('reports a bearing in canon range, unrelated to the spawn sector', () => {
    const { gateway, emits } = build([], 0);

    (gateway as unknown as { handleCybertronSpawned: (e: unknown) => void })
      .handleCybertronSpawned(cybPayload);

    // gernd()%359 with a zero roll is bearing 0.
    expect((logLines(emits)[0].payload as { text: string }).text)
      .toBe(formatMessage(MessageId.CYB_NEW, 0));
  });
});

describe('DROIDNEW — a droid enters the galaxy (GEDROIDS.C:173)', () => {
  it('is its own line, distinct from the Cybertron one', () => {
    const { gateway, emits } = build([], 0);

    (gateway as unknown as { handleDroidSpawned: (e: unknown) => void })
      .handleDroidSpawned(droidPayload);

    const line = logLines(emits)[0];
    expect((line.payload as { text: string }).text).toBe(formatMessage(MessageId.DROID_NEW, 0));
    expect(formatMessage(MessageId.DROID_NEW, 0)).not.toBe(formatMessage(MessageId.CYB_NEW, 0));
  });

  it('still bridges the structured spawn event to the sector roster', () => {
    // The frontend roster update is this port's own, and must survive the
    // addition of the canon line beside it.
    const { gateway, emits } = build();

    (gateway as unknown as { handleDroidSpawned: (e: unknown) => void })
      .handleDroidSpawned(droidPayload);

    const roster = emits.find((e) => e.event !== 'event.log');
    expect(roster?.rooms).toEqual(['sector:4:9']);
  });
});
