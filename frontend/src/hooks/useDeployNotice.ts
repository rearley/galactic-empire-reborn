import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../socket/socketClient';
import type { DeployNoticePayload } from '@ge/wire';

/** How often the countdown redraws. One second is the finest a player reads. */
const TICK_MS = 1000;

export interface DeployNoticeState {
  phase: DeployNoticePayload['phase'];
  /** The server's words, verbatim. The banner never writes its own. */
  text: string;
  /** Seconds remaining, floored at 0. `null` when there is no honest number. */
  secondsLeft: number | null;
  dismiss: () => void;
}

/**
 * State behind the redeploy banner.
 *
 * The server sends `deploy.notice` alongside the `event.log` line. The log
 * keeps the record; this drives the banner, which is what gets it NOTICED —
 * the first production deploy to warn anyone reached two players and one of
 * them missed it entirely, because a log scrolls and they were not watching it.
 *
 * The countdown is computed from a DEADLINE rather than decremented, so a
 * backgrounded tab (where timers are throttled) shows the right number when it
 * comes back instead of however many ticks it managed to run.
 *
 * @see docs/DECISIONS.md 2026-09-20 — deploy warning broadcast
 */
export function useDeployNotice(): DeployNoticeState | null {
  const [notice, setNotice] = useState<DeployNoticePayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const deadline = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    deadline.current = null;
    setNotice(null);
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    const onNotice = (payload: DeployNoticePayload): void => {
      setNotice(payload);
      if (payload.seconds > 0) {
        deadline.current = Date.now() + payload.seconds * 1000;
        setSecondsLeft(payload.seconds);
      } else {
        deadline.current = null;
        setSecondsLeft(null);
      }
    };

    // The restart is what the notice was about, so being back is what ends it.
    // Without this the banner would outlive the event it warned of.
    const onConnect = (): void => { dismiss(); };

    socket.on('deploy.notice', onNotice);
    socket.on('connect', onConnect);
    return () => {
      socket.off('deploy.notice', onNotice);
      socket.off('connect', onConnect);
    };
  }, [dismiss]);

  useEffect(() => {
    if (deadline.current === null) return undefined;
    const id = setInterval(() => {
      const end = deadline.current;
      if (end === null) return;
      // FLOORED AT ZERO. The stop can be late — the hook sleeps its 45 seconds
      // and the container still has to actually stop — and a banner counting
      // into negative numbers would be the last thing a player saw. Zero reads
      // as "any moment now", which stays true however late it runs.
      setSecondsLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [notice]);

  if (!notice) return null;
  return { phase: notice.phase, text: notice.text, secondsLeft, dismiss };
}
