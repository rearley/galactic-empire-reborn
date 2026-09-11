import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../socket/socketClient';
import type { LogEntry } from '../types/logEntry';
import type { EventLogLine } from '@ge/wire';

const MAX_LOG_ENTRIES = 500;

/**
 * The scrolling event-log state and every subscription that feeds it apart
 * from combat narration, which stays in `App.tsx` because it also needs the
 * player roster to name ships. `event.log` and `message.send` carry their own
 * text, `sector:ship-entered` / `sector:ship-left` carry the mover's name in
 * the payload, and the AI taunts are opaque server strings — none of it needs
 * a `NarrationContext`.
 */
export function useEventLog(): {
  lines: LogEntry[];
  append: (lines: EventLogLine[]) => void;
  clear: () => void;
} {
  const [lines, setLines] = useState<LogEntry[]>([]);

  /**
   * Every line gets a monotonic id, used as its React key.
   *
   * EventLog keyed rows by ARRAY INDEX over a `slice(-500)` window, so once the
   * log filled, each new message shifted every index and React re-rendered all
   * 500 rows — thousands of reconciliations a second during a combat burst, on
   * the same thread as the player's keystrokes. Reported from play as scrolling
   * problems and a cursor that "had some issues".
   */
  const nextLineId = useRef(0);
  const withIds = useCallback(
    (ls: EventLogLine[]): LogEntry[] =>
      ls.map((l) => ({ ...l, id: nextLineId.current++ })),
    [],
  );
  const append = useCallback(
    (ls: EventLogLine[]) =>
      setLines((prev) => [...prev, ...withIds(ls)].slice(-MAX_LOG_ENTRIES)),
    [withIds],
  );
  const clear = useCallback(() => setLines([]), []);

  useEffect(() => {
    const handleEntered = (payload: { shipName: string }) => {
      append([{ text: `${payload.shipName} has entered the sector.`, category: 'nav' as const }]);
    };
    const handleLeft = (payload: { shipName: string }) => {
      append([{ text: `${payload.shipName} has left the sector.`, category: 'nav' as const }]);
    };
    socket.on('sector:ship-entered', handleEntered);
    socket.on('sector:ship-left', handleLeft);
    return () => {
      socket.off('sector:ship-entered', handleEntered);
      socket.off('sector:ship-left', handleLeft);
    };
  }, [append]);

  /**
   * Unsolicited server notices.
   *
   * `event.log` is the catch-all the gateway uses for anything that is not a
   * reply to a command: the self-destruct countdown and its detonation, cloak
   * collapse from energy starvation, subsystem damage warnings, the
   * call-for-help alert when someone attacks your planet, and the sector notice
   * when a captain abandons ship. `message.send` carries radio traffic.
   *
   * Neither had a listener, so all of it was dropped: `des` started a countdown
   * the pilot never saw, and `sen`/`fre` transmitted into a void.
   */
  useEffect(() => {
    const handleServerNotice = (payload: { text?: string; category?: EventLogLine['category'] }) => {
      if (typeof payload?.text !== 'string') return;
      append([{ text: payload.text, category: payload.category ?? 'system' }]);
    };

    const handleTransmission = (payload: { from?: string; channel?: string; text?: string }) => {
      if (typeof payload?.text !== 'string' || typeof payload.from !== 'string') return;
      const channel = payload.channel ? `[${payload.channel}] ` : '';
      append([{ text: `${channel}${payload.from}: ${payload.text}`, category: 'chat' }]);
    };

    socket.on('event.log', handleServerNotice);
    socket.on('message.send', handleTransmission);
    return () => {
      socket.off('event.log', handleServerNotice);
      socket.off('message.send', handleTransmission);
    };
  }, [append]);

  useEffect(() => {
    // A Cybertron taunting you, or a droid complaining that you shot it.
    //
    // The server has emitted these since the AI landed and nothing has ever
    // listened, so every one of them was dropped on the floor. That matters
    // more than flavour: scan ranges are asymmetric — an Obliterator sees six
    // sectors and a starter Interceptor one and a half — so the thing hunting
    // you is routinely outside your own scanners, and canon's taunt is the
    // only warning the game gives before it opens fire.
    //
    // Canon's message text is multi-line ("***\nHailing message from The X\n
    // < ... >"); EventLog renders with `whitespace-pre-wrap`, so it survives.
    // @see GECYBS.C:382-410 cyb_annoy, GEDROIDS.C:232-245 droid_annoy
    const handleAiTaunt = (event: { message?: string }) => {
      if (!event?.message) return;
      append([{ text: event.message as string, category: 'combat' as const }]
          .slice(-MAX_LOG_ENTRIES),
      );
    };

    socket.on('cybertron.taunt', handleAiTaunt);
    socket.on('droid.annoy', handleAiTaunt);
    return () => {
      socket.off('cybertron.taunt', handleAiTaunt);
      socket.off('droid.annoy', handleAiTaunt);
    };
  }, [append]);

  return { lines, append, clear };
}
