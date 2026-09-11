import { dispatchBroadcast, emitToSockets, roomMembers } from '../../src/gateway/broadcast-dispatch';
import type { CommandBroadcast } from '../../src/game/commands/command.types';
import type { ShipState } from '../../src/game/ship/ship-state.types';

/** A minimal fake socket: an `emit` spy plus the `data` fields `emitToSockets` reads. */
function fakeSocket(userid: string | undefined, activeShipNo: number | undefined) {
  return { emit: jest.fn(), data: { userid, activeShipNo } };
}

function fakeServer(sockets: Record<string, ReturnType<typeof fakeSocket>>) {
  return { sockets: { sockets: new Map(Object.entries(sockets)) } };
}

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

describe('emitToSockets', () => {
  const broadcast: CommandBroadcast = {
    room: 'sector:0:0',
    event: 'command.notice',
    payload: { lines: [{ text: 'hi', category: 'info' }] },
  };
  const shipA = { userid: 'a', shipno: 1 } as unknown as ShipState;
  const shipB = { userid: 'b', shipno: 2 } as unknown as ShipState;

  it('emits only to sockets whose ship satisfies accept', () => {
    const a = fakeSocket('a', 1);
    const b = fakeSocket('b', 2);
    const server = fakeServer({ a, b });
    const lookup = jest.fn((uid: string) => (uid === 'a' ? shipA : shipB));

    emitToSockets(server as never, broadcast, undefined, undefined, (ship) => ship === shipA, lookup);

    expect(a.emit).toHaveBeenCalledWith('command.notice', broadcast.payload);
    expect(b.emit).not.toHaveBeenCalled();
  });

  it('skips excludeId without calling lookup for that socket', () => {
    const a = fakeSocket('a', 1);
    const b = fakeSocket('b', 2);
    const server = fakeServer({ a, b });
    const lookup = jest.fn().mockReturnValue(shipB);

    emitToSockets(server as never, broadcast, undefined, 'a', () => true, lookup);

    expect(a.emit).not.toHaveBeenCalled();
    expect(b.emit).toHaveBeenCalledWith('command.notice', broadcast.payload);
    expect(lookup).not.toHaveBeenCalledWith('a', 1);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('b', 2);
  });

  it('passes uid and shipno to lookup in that order', () => {
    const a = fakeSocket('a', 7);
    const server = fakeServer({ a });
    const lookup = jest.fn().mockReturnValue(shipA);

    emitToSockets(server as never, broadcast, undefined, undefined, () => true, lookup);

    expect(lookup).toHaveBeenCalledWith('a', 7);
  });

  it('sweeps only members when given', () => {
    const a = fakeSocket('a', 1);
    const b = fakeSocket('b', 2);
    const server = fakeServer({ a, b });
    const lookup = jest.fn().mockReturnValue(shipA);

    emitToSockets(server as never, broadcast, new Set(['a']), undefined, () => true, lookup);

    expect(a.emit).toHaveBeenCalledWith('command.notice', broadcast.payload);
    expect(b.emit).not.toHaveBeenCalled();
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('sweeps every connected socket when members is undefined', () => {
    const a = fakeSocket('a', 1);
    const b = fakeSocket('b', 2);
    const server = fakeServer({ a, b });
    const lookup = jest.fn().mockReturnValue(shipA);

    emitToSockets(server as never, broadcast, undefined, undefined, () => true, lookup);

    expect(a.emit).toHaveBeenCalledWith('command.notice', broadcast.payload);
    expect(b.emit).toHaveBeenCalledWith('command.notice', broadcast.payload);
  });

  it('skips a socket whose data.userid or data.activeShipNo is missing', () => {
    const noUser = fakeSocket(undefined, 1);
    const noShip = fakeSocket('c', undefined);
    const server = fakeServer({ noUser, noShip });
    const lookup = jest.fn().mockReturnValue(shipA);

    emitToSockets(server as never, broadcast, undefined, undefined, () => true, lookup);

    expect(noUser.emit).not.toHaveBeenCalled();
    expect(noShip.emit).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('skips a socket whose lookup returns undefined', () => {
    const a = fakeSocket('a', 1);
    const server = fakeServer({ a });
    const lookup = jest.fn().mockReturnValue(undefined);
    const accept = jest.fn(() => true);

    emitToSockets(server as never, broadcast, undefined, undefined, accept, lookup);

    expect(a.emit).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
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
