import React, { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../types/logEntry';

const MAX_ENTRIES = 500;
/**
 * How far off the bottom the reader may drift and still be "following".
 *
 * This was 8px against a ~20px line height, so drifting a SINGLE line
 * disengaged auto-scroll for good — a trackpad nudge, a click that shifted
 * scroll a few pixels, or the container growing between the scroll write and
 * the scroll event during a burst. Nothing showed it had happened and nothing
 * brought it back but scrolling to within 8px of the bottom by hand. Reported
 * from play as having to scroll manually mid-battle to see what happened.
 *
 * Three lines is a deliberate tolerance: enough to survive noise, small enough
 * that a reader who has genuinely scrolled up is left where they put
 * themselves. @see test/eventlog-sticky.spec.tsx
 */
const STICKY_THRESHOLD = 60;

const CATEGORY_CLASS: Record<string, string> = {
  system:  'text-gray-400',
  info:    'text-gray-100',
  success: 'text-green-400',
  combat:  'text-red-400',
  nav:     'text-cyan-300',
  chat:    'text-yellow-300',
};

interface EventLogProps {
  lines: LogEntry[];
}

/**
 * Scrolling event log — caps at 500 entries (FIFO drop), auto-scrolls to
 * bottom when sticky, pauses scroll when the user scrolls up (FR-008, FR-010).
 * Unknown categories fall back to a generic style (FR-011).
 * @see specs/003-ship-commands/contracts/websocket-events.md §command:result
 * @see specs/010-react-frontend/spec.md FR-008, FR-010, FR-011
 * @see research.md R2 sticky-bottom threshold
 */
export function EventLog({ lines }: EventLogProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stickyBottom, setStickyBottom] = useState(true);

  const capped = lines.slice(-MAX_ENTRIES);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setStickyBottom(distanceFromBottom <= STICKY_THRESHOLD);
  };

  /** Resume following, and go to the bottom now. */
  const jumpToLatest = () => {
    setStickyBottom(true);
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  /**
   * Coalesce the scroll to one write per animation frame.
   *
   * This wrote `scrollTop` synchronously for every message. A combat burst
   * arrives as many separate socket events, so the log was forcing a layout
   * per line and fighting the player if they tried to scroll up mid-burst.
   * One frame is the finest granularity the display can actually show.
   */
  useEffect(() => {
    if (!stickyBottom) return;
    const raf = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [lines, stickyBottom]);

  return (
    <>
      <div className="border-b border-gray-800 px-3 py-1 flex-shrink-0 flex items-center justify-between">
        <span className="text-xs text-gray-500 uppercase tracking-widest">Event Log</span>
        {/*
          * Auto-scroll is a MODE, and it used to be invisible: once it
          * disengaged there was no sign it had, and no way back but scrolling
          * by hand. Showing it only while paused keeps the header quiet the
          * rest of the time.
          */}
        {!stickyBottom && (
          <button
            type="button"
            onClick={jumpToLatest}
            data-testid="jump-to-latest"
            className="text-xs text-accent hover:underline"
          >
            ↓ jump to latest
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-sm p-2 bg-black"
        data-testid="event-log"
      >
        {capped.map((line) => (
          <div
            key={line.id}
            // whitespace-pre-wrap keeps the column padding that who/ros/pla/pri
            // emit (padEnd/padStart) from being collapsed by the browser, while
            // still wrapping long narrative lines inside the panel.
            className={`whitespace-pre-wrap ${CATEGORY_CLASS[line.category] ?? 'text-gray-100'}`}
            data-testid={`log-line-${line.category}`}
          >
            {line.text}
          </div>
        ))}
      </div>
    </>
  );
}
