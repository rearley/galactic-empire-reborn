import 'reflect-metadata';
import { makeGateway } from '../helpers/make-gateway';
import type { CommandResult } from '../../src/game/commands/command.types';

/**
 * `excludeSelf` was honoured on three of the five broadcast branches and
 * silently dropped on the two that take a room as given.
 *
 * Found by typing `x` in a browser: the pilot leaving read "*** Scanners can no
 * longer locate The Orbiter, Sir!" about their own ship. The exit handler's own
 * docstring says canon prints nothing to the pilot who leaves: the exit arm of
 * GEMAIN.C:2859 `if (sameas(input,"x"))` announces to the SECTOR with
 * `outsect`, and the handler sets `excludeSelf: true` to say so. `processBroadcasts` computed `excludeId` and then never passed it
 * to `server.to(room)`.
 *
 * `clo off` has the same fault and the same evidence sitting in its source: the
 * comment there records that without the exclusion the pilot is told "Sensors
 * indicate a ship de-cloaking nearby Sir!" about themselves, one line after
 * "Cloaking device is now off, Sir!". The flag was added; the dispatch never
 * read it, so the fix it describes never happened.
 *
 * The frequency, `ship:` and `hail` branches all pass `excludeId` to
 * `emitToSockets` and were never affected.
 */
describe('processBroadcasts — excludeSelf on a room broadcast', () => {
  const build = () => {
    const gateway = makeGateway();
    const emit = vi.fn();
    const except = vi.fn(() => ({ emit }));
    const to = vi.fn(() => ({ emit, except }));
    const serverExcept = vi.fn(() => ({ emit, to }));
    (gateway as unknown as { server: unknown }).server = {
      emit,
      to,
      except: serverExcept,
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    const run = (result: CommandResult, senderId = 'sock-1') =>
      (gateway as unknown as {
        processBroadcasts: (r: CommandResult, s?: { id: string }) => void;
      }).processBroadcasts(result, { id: senderId });
    return { run, to, except, serverExcept, emit };
  };

  const sectorBroadcast = (excludeSelf: boolean): CommandResult => ({
    lines: [],
    broadcasts: [
      {
        room: 'sector:5:3',
        event: 'event.log',
        payload: { category: 'system', text: 'Scanners can no longer locate The Orbiter, Sir!' },
        ...(excludeSelf ? { excludeSelf: true } : {}),
      },
    ],
  });

  it('leaves the sender out of a sector-room broadcast', () => {
    const { run, to, except } = build();

    run(sectorBroadcast(true));

    expect(to).toHaveBeenCalledWith('sector:5:3');
    expect(except).toHaveBeenCalledWith('sock-1');
  });

  it('excludes nobody when the flag is absent', () => {
    const { run, to, except } = build();

    run(sectorBroadcast(false));

    expect(to).toHaveBeenCalledWith('sector:5:3');
    expect(except).not.toHaveBeenCalled();
  });

  it('leaves the sender out of a galaxy broadcast too', () => {
    const { run, serverExcept } = build();

    run({
      lines: [],
      broadcasts: [
        {
          room: 'galaxy',
          event: 'event.log',
          payload: { category: 'system', text: 'anything' },
          excludeSelf: true,
        },
      ],
    });

    expect(serverExcept).toHaveBeenCalledWith('sock-1');
  });
});
