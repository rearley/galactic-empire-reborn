import React from 'react';
import type { DeployNoticeState } from '../hooks/useDeployNotice';

interface DeployBannerProps {
  notice: DeployNoticeState | null;
}

/**
 * `m:ss`, or plain words once it runs out.
 *
 * Zero is NOT rendered as `0:00`. The stop can be late — the pre-update hook
 * sleeps its 45 seconds and the container still has to be stopped — and a
 * timer frozen at zero looks broken. "any moment now" stays true however late
 * it runs, which is the only thing the banner can honestly promise by then.
 */
export function countdownLabel(seconds: number): string {
  if (seconds <= 0) return 'any moment now';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The redeploy warning, pinned above everything.
 *
 * NOT in the event log, deliberately. The log already carries the same words
 * and keeps the record, but it scrolls: the first production deploy to warn
 * anyone reached two players and one of them missed it entirely. A banner
 * cannot be scrolled past, and the countdown means a glance at any moment
 * answers "how long have I got" rather than "what did that line say".
 *
 * The text is always the SERVER's. This component writes none of its own, so
 * the banner and the log line can never disagree.
 *
 * @see hooks/useDeployNotice.ts, docs/DECISIONS.md 2026-09-20
 */
export function DeployBanner({ notice }: DeployBannerProps): React.JSX.Element | null {
  if (!notice) return null;

  // The heads-up is five to ten minutes out and should not shout; the
  // countdown is the one that wants acting on.
  const urgent = notice.phase === 'imminent';
  const tone = urgent
    ? 'bg-orange-900 text-orange-100 border-orange-600'
    : 'bg-gray-800 text-gray-200 border-gray-600';

  return (
    <div
      data-testid="deploy-banner"
      role="alert"
      aria-live="assertive"
      className={`flex w-full shrink-0 items-center gap-3 border-b px-4 py-1.5 font-mono text-xs ${tone}`}
    >
      {notice.secondsLeft !== null && (
        <span
          data-testid="deploy-countdown"
          className="shrink-0 tabular-nums font-bold tracking-widest"
        >
          {countdownLabel(notice.secondsLeft)}
        </span>
      )}
      <span className="min-w-0 flex-1">{notice.text}</span>
      <button
        type="button"
        data-testid="deploy-dismiss"
        onClick={notice.dismiss}
        aria-label="Dismiss this notice"
        className="shrink-0 px-1 opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
