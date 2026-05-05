import React, { useEffect, useRef, useState } from 'react';
import type { EventLogLine } from '../types/contracts';

const MAX_ENTRIES = 500;
const STICKY_THRESHOLD = 8; // px from bottom before sticky disengages (research.md R2)

const CATEGORY_CLASS: Record<string, string> = {
  system:  'text-gray-400',
  info:    'text-gray-100',
  success: 'text-green-400',
  combat:  'text-red-400',
  nav:     'text-cyan-300',
  chat:    'text-yellow-300',
};

interface EventLogProps {
  lines: EventLogLine[];
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

  useEffect(() => {
    if (stickyBottom) {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [lines, stickyBottom]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto font-mono text-sm p-2 bg-black"
      data-testid="event-log"
    >
      {capped.map((line, idx) => (
        <div
          key={idx}
          className={CATEGORY_CLASS[line.category] ?? 'text-gray-100'}
          data-testid={`log-line-${line.category}`}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}
