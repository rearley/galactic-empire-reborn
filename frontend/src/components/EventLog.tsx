import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  // Operational rather than in-fiction, and today only the redeploy countdown.
  // Orange sits between `nav` and `combat`: urgent without reading as damage.
  // Without this it fell through to the default and looked like an ordinary
  // line, which is the one thing an alert must not do.
  alert:   'text-orange-300',
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
  /**
   * The scroll position we last wrote ourselves, read back AFTER the write so
   * it holds the browser's clamped value rather than the `scrollHeight` we
   * asked for. `null` means the next scroll event is the reader's.
   */
  const writtenTop = useRef<number | null>(null);
  /**
   * Whether a PERSON caused the scroll event we are about to handle.
   *
   * Pixel arithmetic cannot tell who moved the log. The browser moves it too:
   * this list is FIFO-capped, so once it fills, every new line drops one off
   * the top — and content changing above the viewport is precisely what
   * Chrome's scroll anchoring compensates for, by adjusting `scrollTop` and
   * dispatching a scroll event carrying a value we never wrote. Read as
   * distance-from-bottom that says "the reader has scrolled away", and
   * auto-scroll disengaged mid-battle once the cap first bit.
   *
   * So the mode only changes on evidence of intent: a wheel, a touch, a key,
   * or a pointer on the scrollbar. Spent on the scroll it causes, or one nudge
   * would arm every later browser-driven scroll for the rest of the session.
   */
  const readerMoved = useRef(false);
  const noteIntent = () => { readerMoved.current = true; };

  /**
   * Scroll to the bottom and remember where that landed.
   *
   * `useCallback` with no dependencies: it touches only its argument and a ref,
   * both stable, so the effect below can list it without re-running.
   */
  const scrollToBottom = useCallback((el: HTMLDivElement) => {
    el.scrollTop = el.scrollHeight;
    writtenTop.current = el.scrollTop;
  }, []);

  const capped = lines.slice(-MAX_ENTRIES);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;

    // A scroll event still sitting at the position WE wrote is not the reader
    // moving — it is the delayed event for our own write, and by the time it
    // arrives a burst may have grown the log underneath it. Measuring distance
    // then charges the reader for content they never scrolled past. @see
    // test/eventlog-sticky.spec.tsx "does not offer to jump when only the
    // content grew"
    if (writtenTop.current !== null && el.scrollTop === writtenTop.current) return;
    writtenTop.current = null;

    // Nobody touched anything: this is the browser's own adjustment, and it is
    // not a request to stop following. @see readerMoved
    if (!readerMoved.current) return;
    readerMoved.current = false;

    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setStickyBottom(distanceFromBottom <= STICKY_THRESHOLD);
  };

  /** Resume following, and go to the bottom now. */
  const jumpToLatest = () => {
    readerMoved.current = false;
    setStickyBottom(true);
    const el = containerRef.current;
    if (el) scrollToBottom(el);
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
      if (el) scrollToBottom(el);
    });
    return () => cancelAnimationFrame(raf);
    // `lines` is not read in here — it is the TRIGGER. A new line has just
    // been rendered and the log has to follow it to the bottom, so the effect
    // must run when the list changes even though the effect body only touches
    // the container. The rule cannot see the difference between a dependency
    // read and a dependency that means "something happened"; this is the
    // second kind. @see issue #25
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [lines, stickyBottom, scrollToBottom]);

  return (
    <>
      <div className="border-b border-gray-800 px-3 py-1 shrink-0 flex items-center justify-between">
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
        onWheel={noteIntent}
        onTouchMove={noteIntent}
        onKeyDown={noteIntent}
        onPointerDown={noteIntent}
        /*
         * Scroll anchoring holds visible text still when content above changes
         * — the right call for an article, the wrong one for a log that is
         * pinned to its bottom and drops lines off its top. It fights the pin
         * and fires scroll events nobody asked for. @see readerMoved
         */
        style={{ overflowAnchor: 'none' }}
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
