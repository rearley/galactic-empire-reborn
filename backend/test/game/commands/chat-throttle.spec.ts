import { allowChat, CHAT_BURST, CHAT_WINDOW_MS } from '../../../src/game/commands/handlers/helpers/chat-throttle';

/**
 * `sen` is a galaxy-wide broadcast anyone can fire, and canon throttles it not
 * at all — MajorBBS gave one command per user per pass, so a flood was not
 * reachable from a terminal. Over a socket it is: `sen.handler` makes no
 * database call, so it completes instantly and the per-socket command queue
 * (Part A) does nothing to slow it. One client could fill every other player's
 * event log as fast as it could send packets.
 *
 * The limit has to be far above conversation and far below a flood. A person
 * sending a considered line of chat manages maybe one every few seconds; this
 * allows a burst of CHAT_BURST inside CHAT_WINDOW_MS, so a genuine
 * back-and-forth never meets it and a script does immediately.
 *
 * Port-original — canon has no equivalent. @see docs/DECISIONS.md 2026-09-09
 */
describe('chat throttle', () => {
  it('lets a normal conversation through untouched', () => {
    // One message every two seconds, for a minute. Never blocked.
    let history: number[] = [];
    for (let t = 0; t < 60_000; t += 2_000) {
      const r = allowChat(history, t);
      expect(r.allowed).toBe(true);
      history = r.history;
    }
  });

  it('allows a burst — a player pasting two or three lines is not a flood', () => {
    let history: number[] = [];
    for (let i = 0; i < CHAT_BURST; i++) {
      const r = allowChat(history, 1_000 + i);
      expect(r.allowed).toBe(true);
      history = r.history;
    }
  });

  it('stops the one after the burst', () => {
    let history: number[] = [];
    for (let i = 0; i < CHAT_BURST; i++) history = allowChat(history, 1_000 + i).history;

    expect(allowChat(history, 1_000 + CHAT_BURST).allowed).toBe(false);
  });

  it('a refusal does not count against the sender', () => {
    // Otherwise a blocked flood would keep extending its own ban.
    let history: number[] = [];
    for (let i = 0; i < CHAT_BURST; i++) history = allowChat(history, 1_000 + i).history;
    const blocked = allowChat(history, 1_100);

    expect(blocked.allowed).toBe(false);
    expect(blocked.history).toHaveLength(CHAT_BURST);
  });

  it('forgives once the window has passed', () => {
    let history: number[] = [];
    for (let i = 0; i < CHAT_BURST; i++) history = allowChat(history, 1_000 + i).history;

    expect(allowChat(history, 1_000 + CHAT_WINDOW_MS + 1).allowed).toBe(true);
  });

  it('does not grow without bound', () => {
    let history: number[] = [];
    for (let t = 0; t < 1_000_000; t += 3_000) history = allowChat(history, t).history;

    expect(history.length).toBeLessThanOrEqual(CHAT_BURST);
  });
});
