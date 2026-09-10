/**
 * Every event the gateway sends to clients must have a listener here.
 *
 * "Emitted with no listener" is this project's most persistent bug shape. The
 * state change lands on the server and the player is simply never told, so it
 * reads as the feature not existing. It has now happened to PHYSICS_HYPERSPACE,
 * COMBAT_MINE_WARNING, PHYSICS_UNIVERSE_EDGE, SHIP_SHIELD_CHARGE, and — for the
 * entire life of the AI — `cybertron.taunt` and `droid.annoy`, which the server
 * has always emitted and the client has never heard.
 *
 * That last pair is not flavour. Scan ranges are asymmetric: an Obliterator
 * sees six sectors and a starter Interceptor one and a half, so the thing
 * hunting you is routinely outside your own scanners. Canon's taunt is the only
 * warning before it fires (GECYBS.C:382-410).
 *
 * This scans the gateway for client-bound emits and checks each one is
 * registered with a `socket.on(...)` somewhere under frontend/src. It is deliberately crude — it reads
 * source text rather than running the app — because the alternative is noticing
 * six months later that a message never arrives.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../..');
const GATEWAY_DIR = join(REPO, 'backend/src/gateway');
const FRONTEND_SRC = join(REPO, 'frontend/src');

function walk(dir: string, test: RegExp): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, test));
    else if (test.test(e)) out.push(p);
  }
  return out;
}

/** Resolve `FOO_EVENT.BAR` / `FooEvents.BAR` constants to their string values. */
function eventConstants(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of walk(join(REPO, 'backend/src'), /-events\.ts$/)) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/^\s{2}([A-Z_]+):\s*'([a-z][\w.:-]*)'/gm)) {
      out.set(m[1], m[2]);
    }
    for (const m of text.matchAll(/^export const ([A-Z_]+)\s*=\s*'([a-z][\w.:-]*)'/gm)) {
      out.set(m[1], m[2]);
    }
  }
  return out;
}

/** Event names the gateway emits toward clients. */
function gatewayEmits(): string[] {
  const consts = eventConstants();
  const names = new Set<string>();
  for (const f of walk(GATEWAY_DIR, /\.ts$/)) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\.emit\(\s*'([a-z][\w.:-]*)'/g)) names.add(m[1]);
    for (const m of text.matchAll(/\.emit\(\s*(?:[A-Za-z_]+)\.([A-Z_]+)/g)) {
      const v = consts.get(m[1]);
      if (v) names.add(v);
    }
    for (const m of text.matchAll(/\.emit\(\s*([A-Z][A-Z_]+)\s*,/g)) {
      const v = consts.get(m[1]);
      if (v) names.add(v);
    }
  }
  return [...names].sort();
}

/**
 * Events the client deliberately does not surface.
 *
 * Add to this ONLY with a reason. An entry here is a promise that a human
 * decided the player does not need to see it — not a place to silence a
 * failure.
 */
const DELIBERATELY_UNHANDLED: Record<string, string> = {
  'cybertron.broke-off': 'internal telemetry; canon prints nothing when a cyb disengages',
  'combat.miss':
    'canon tells only the firer, and it already arrives on command:result as '
    + '"Phasers fired - no targets in arc". Canon prints nothing to bystanders '
    + 'for a miss (GECMDS.C:942-943 sends PFIRED to the firer alone).',
  'combat.mine-detonation':
    'canon MINE5 is "Sensors indicate a large neutron explosion bearing %d, Sir!" '
    + 'and the payload carries no bearing, so it cannot be rendered faithfully '
    + 'yet. Fixing it means adding bearing server-side, not inventing a line here.',
  'command.notice':
    'emitted via the dynamic broadcast path (scan.handler.ts, `sca sh`) to tell '
    + 'one hull it has been scanned; the frontend has no listener today. Recorded '
    + 'as a finding, not fixed, by the 2026-09-10 typed-wire-contract phase — a '
    + 'later phase decides whether this is dead code or an unfinished feature. '
    + 'This scanner could not see it before that phase typed '
    + '`GameGateway.processBroadcasts`\' dispatch: the event name used to reach '
    + '`.emit()` only as a variable (`broadcast.event`), invisible to this '
    + "file's source-text regex, and became a literal only once the typed emit "
    + 'map required narrowing on it.',
};

describe('gateway → client event coverage', () => {
  const emitted = gatewayEmits();
  // Match a REGISTRATION, not any mention of the name: `socket.off('x', h)`
  // carries the same string, and the first version of this test passed happily
  // with the `.on` deleted because of it.
  const listened = new Set<string>();
  for (const f of walk(FRONTEND_SRC, /\.tsx?$/)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\.on\(\s*'([a-z][\w.:-]*)'/g)) {
      listened.add(m[1]);
    }
  }

  it('finds the gateway emits at all (guards the scanner itself)', () => {
    // If the regexes ever stop matching, every other assertion here passes
    // vacuously. These three are stable and must always be found.
    expect(emitted).toEqual(expect.arrayContaining(['event.log', 'command:result', 'cybertron.taunt']));
    expect(emitted.length).toBeGreaterThan(10);
  });

  it('every emitted event is either handled or explicitly excused', () => {
    const orphans = emitted.filter(
      (name) => !DELIBERATELY_UNHANDLED[name] && !listened.has(name),
    );
    expect(orphans).toEqual([]);
  });

  it('the excuse list has no stale entries', () => {
    const stale = Object.keys(DELIBERATELY_UNHANDLED).filter((n) => !emitted.includes(n));
    expect(stale).toEqual([]);
  });
});
