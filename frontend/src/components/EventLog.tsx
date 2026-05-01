import React, { useEffect, useRef } from 'react';
import type { EventLogLine } from '../types/contracts';

const CATEGORY_CLASS: Record<string, string> = {
  system: 'text-gray-400',
  info: 'text-gray-100',
  success: 'text-green-400',
  combat: 'text-red-400',
};

interface EventLogProps {
  lines: EventLogLine[];
}

/**
 * Scrolling event log that auto-scrolls to the bottom on each new line.
 * @see specs/003-ship-commands/contracts/websocket-events.md §command:result
 */
export function EventLog({ lines }: EventLogProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto font-mono text-sm p-2 bg-black"
      data-testid="event-log"
    >
      {lines.map((line, idx) => (
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
