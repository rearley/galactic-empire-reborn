import { dispatchBroadcast, roomMembers } from '../../src/gateway/broadcast-dispatch';
import type { CommandBroadcast } from '../../src/game/commands/command.types';

describe('dispatchBroadcast', () => {
  it('emits command.notice with its own payload', () => {
    const emit = jest.fn();
    const broadcast: CommandBroadcast = {
      room: 'sector:0:0',
      event: 'command.notice',
      payload: { lines: [{ text: 'hello', category: 'info' }] },
    };
    dispatchBroadcast({ emit } as never, broadcast);
    expect(emit).toHaveBeenCalledWith('command.notice', { lines: [{ text: 'hello', category: 'info' }] });
  });

  it('resolves player.snapshot to nothing — the caller handles it before dispatch', () => {
    const emit = jest.fn();
    const broadcast: CommandBroadcast = {
      room: 'galaxy',
      event: 'player.snapshot',
      payload: {},
    };
    dispatchBroadcast({ emit } as never, broadcast);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('roomMembers', () => {
  it('returns the room members when the room exists', () => {
    const server = { sockets: { adapter: { rooms: new Map([['sector:1:1', new Set(['a', 'b'])]]) } } };
    expect(roomMembers(server as never, 'sector:1:1')).toEqual(new Set(['a', 'b']));
  });

  it('returns an empty set when the room is gone', () => {
    const server = { sockets: { adapter: { rooms: new Map() } } };
    expect(roomMembers(server as never, 'sector:9:9')).toEqual(new Set());
  });
});
