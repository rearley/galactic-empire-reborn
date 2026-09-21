import { CybTraceService, CYB_TRACE_DEPTH } from '../../../src/game/cybertron/cyb-trace.service';
import type { CybClaimState } from '../../../src/game/cybertron/cyb-transitions';

/**
 * The per-Cybertron decision trace a sysop reads with `sys trace`.
 *
 * Built because every Obliterator investigation on 2026-09-20 started from a
 * production row and worked backwards to guess which branch had put it there —
 * five passes, each a deploy. The trace records what the AI decided, in canon's
 * own field names, so the next one is a single read. @see issue #60
 */
const KEY = 'Cybrg-205:205';
const ship = (over: Partial<CybClaimState> = {}): CybClaimState => ({
  cybmine: 18, speed2b: 284, head2b: 90, holdcourse: 0, cybupdate: 40, tick: 12, ...over,
});

function harness(start = 1_000_000) {
  let t = start;
  const trace = new CybTraceService({ now: () => t });
  return { trace, advance: (ms: number) => { t += ms; } };
}

describe('CybTraceService — transitions', () => {
  it('records the event with before → after for each field that changed, and only those', () => {
    const { trace } = harness();
    const s = ship();
    trace.transition(KEY, s, 'releaseZoneEntry', () => { s.cybmine = 255; s.speed2b = 1730; s.head2b = 211.4; });

    expect(trace.read(KEY)).toEqual([{
      at: 1_000_000,
      act: 0,
      event: 'releaseZoneEntry',
      changes: [
        { field: 'cybmine', from: 18, to: 255 },
        { field: 'speed2b', from: 284, to: 1730 },
        { field: 'head2b', from: 90, to: 211.4 },
      ],
    }]);
  });

  it('always runs the transition, and records nothing when it changed nothing', () => {
    const { trace } = harness();
    const s = ship({ cybmine: 255 });
    let ran = false;
    trace.transition(KEY, s, 'releaseStale', () => { ran = true; s.cybmine = 255; });
    expect(ran).toBe(true);
    expect(trace.read(KEY)).toEqual([]);
  });

  it('carries a detail line when one is given', () => {
    const { trace } = harness();
    const s = ship({ cybmine: 255 });
    trace.transition(KEY, s, 'provoke', () => { s.cybmine = 7; }, 'hit by Wasp');
    expect(trace.read(KEY)[0].detail).toBe('hit by Wasp');
  });
});

describe('CybTraceService — activations and notes', () => {
  it('numbers entries by the ship\'s own activation count', () => {
    const { trace, advance } = harness();
    trace.beginActivation(KEY);
    trace.note(KEY, 'scan', '3 seen → no target');
    advance(6000);
    trace.beginActivation(KEY);
    trace.note(KEY, 'scan', '2 seen → no target');

    expect(trace.read(KEY).map((e) => [e.act, e.at])).toEqual([[1, 1_000_000], [2, 1_006_000]]);
  });

  it('counts activations per ship, not globally', () => {
    const { trace } = harness();
    trace.beginActivation(KEY);
    trace.beginActivation(KEY);
    trace.beginActivation('Cybrg-9:9');
    trace.note('Cybrg-9:9', 'scan', 'x');
    expect(trace.read('Cybrg-9:9')[0].act).toBe(1);
  });
});

describe('CybTraceService — steering', () => {
  it('records a band the first time, with the speed change', () => {
    const { trace } = harness();
    const s = ship({ speed2b: 990 });
    trace.band(KEY, s, 'close', () => { s.speed2b = 284; });
    expect(trace.read(KEY)).toEqual([{
      at: 1_000_000, act: 0, event: 'band close',
      changes: [{ field: 'speed2b', from: 990, to: 284 }],
    }]);
  });

  it('does not repeat an unchanged band, so a long chase cannot flush the history out', () => {
    const { trace } = harness();
    const s = ship();
    for (let i = 0; i < 10; i++) trace.band(KEY, s, 'close', () => { s.speed2b = i; });
    expect(trace.read(KEY)).toHaveLength(1);
  });

  it('records the band again once it changes, or once a transition has intervened', () => {
    const { trace } = harness();
    const s = ship();
    trace.band(KEY, s, 'approach', () => { s.speed2b = 8000; });
    trace.band(KEY, s, 'close', () => { s.speed2b = 990; });
    trace.transition(KEY, s, 'releaseTargetLeft', () => { s.cybmine = 255; });
    trace.transition(KEY, s, 'acquire', () => { s.cybmine = 4; });
    trace.band(KEY, s, 'close', () => { s.speed2b = 990; });
    expect(trace.read(KEY).map((e) => e.event))
      .toEqual(['band approach', 'band close', 'releaseTargetLeft', 'acquire', 'band close']);
  });
});

describe('CybTraceService — retention', () => {
  it(`keeps the newest ${CYB_TRACE_DEPTH} entries per ship, oldest first`, () => {
    const { trace } = harness();
    for (let i = 0; i < CYB_TRACE_DEPTH + 7; i++) trace.note(KEY, 'scan', `#${i}`);
    const kept = trace.read(KEY);
    expect(kept).toHaveLength(CYB_TRACE_DEPTH);
    expect(kept[0].detail).toBe('#7');
    expect(kept[CYB_TRACE_DEPTH - 1].detail).toBe(`#${CYB_TRACE_DEPTH + 6}`);
  });

  it('reset clears a slot for a new hull, including its activation count and band memory', () => {
    const { trace } = harness();
    const s = ship();
    trace.beginActivation(KEY);
    trace.band(KEY, s, 'close', () => { s.speed2b = 1; });
    trace.reset(KEY);
    expect(trace.read(KEY)).toEqual([]);
    trace.band(KEY, s, 'close', () => { s.speed2b = 2; });
    expect(trace.read(KEY)).toEqual([expect.objectContaining({ act: 0, event: 'band close' })]);
  });

  it('reads an unknown ship as empty rather than throwing', () => {
    expect(harness().trace.read('nobody:1')).toEqual([]);
  });

  it('hands out a copy, so a reader cannot rewrite history', () => {
    const { trace } = harness();
    trace.note(KEY, 'scan', 'x');
    (trace.read(KEY) as unknown as unknown[]).length = 0;
    expect(trace.read(KEY)).toHaveLength(1);
  });
});
