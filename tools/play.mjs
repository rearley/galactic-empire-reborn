#!/usr/bin/env node
/**
 * Playtest client — drives a real player session over the real socket.
 *
 * Same pipeline a browser client uses: HTTP register/login for a JWT, a
 * socket.io connection carrying it, `command` in and `command:result` out.
 * Nothing here reaches into the database or the debug routes, so anything it
 * does, a player could do.
 *
 * Usage:
 *   node tools/play.mjs <username> <password> <<'CMDS'
 *   rep nav
 *   wait 6
 *   sca lo
 *   CMDS
 *
 * Lines are commands, one per line. Special directives:
 *   wait <seconds>   pause (the world keeps moving)
 *   #  ...           comment
 *
 * Any prompt the server raises (ship name, fleet select) is answered from the
 * PERSONA_SHIP env var / the first fleet entry unless a `reply <text>` line
 * supplies something else.
 */
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
// socket.io-client lives in the backend workspace; resolve from there so the
// harness needs no install of its own.
const { io } = require_('/home/rick/dev/galactic-empire-reborn/backend/node_modules/socket.io-client');

const API = process.env.GE_API ?? 'http://localhost:3000';
const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('usage: play.mjs <username> <password>  (commands on stdin)');
  process.exit(2);
}

const shipName = process.env.PERSONA_SHIP ?? `${username}-1`.slice(0, 19);

async function auth() {
  for (const path of ['/auth/login', '/auth/register']) {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) return (await res.json()).token;
  }
  throw new Error(`auth failed for ${username}`);
}

const script = await new Promise((resolve) => {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (buf += d));
  process.stdin.on('end', () => resolve(buf));
});

const token = await auth();
const socket = io(API, { transports: ['websocket'], auth: { token }, reconnection: true });

const out = (tag, text) => console.log(`${tag} ${text}`);

socket.on('connect', () => out('..', 'connected'));
socket.on('disconnect', (r) => out('..', `disconnected (${r})`));
socket.on('error', (e) => out('!!', `server error: ${JSON.stringify(e)}`));
socket.on('command:result', (p) => {
  for (const l of p.lines ?? []) out('<<', l.text);
});
// The gateway splits a scan in two: `command:result` carries only the header
// line, and the grid + side panel arrive as their own `scan:render` event
// (game.gateway.ts:1329-1333). Subscribing to command:result alone yields a
// range header and nothing else, which is what made every playtest scan look
// empty.
socket.on('scan:render', (p) => renderScan(p));

/**
 * Render the scan payload.
 *
 * `sca lo` / `sca ra` / `sca se` return their contents as a structured
 * `scanRender` (a grid of cells plus a side panel), NOT as text lines. This
 * harness printed only `lines`, so every scan looked empty — no ships, no
 * planets, just the range header — and a playtest reported "nothing on scan"
 * that was purely an instrumentation gap. The same shape of gap once hid combat
 * hits for three sessions.
 */
/** Side panel from the most recent scan — what `engage` aims at. */
let lastContacts = [];

function renderScan(sr) {
  // The payload field is `cells` (command.types.ts:101), not `grid`. Reading the
  // wrong name rendered every scan as empty — the THIRD variant of this same
  // mistake in one session: first no subscription to combat.hit, then listening
  // on command:result instead of the scan:render event, now the wrong field on
  // the right event. A harness that silently drops output manufactures bugs.
  const cells = sr.cells ?? sr.grid ?? [];
  if (cells.length) {
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (let y = y0; y <= y1; y++) {
      let row = '';
      for (let x = x0; x <= x1; x++) {
        const c = cells.find((k) => k.x === x && k.y === y);
        row += c ? (c.char ?? '?') : ' ';
      }
      if (row.trim()) out('##', row);
    }
  }
  lastContacts = (sr.sidePanel ?? []).slice();
  for (const r of lastContacts) {
    // distance is raw units; bearing and heading are signed -180..180.
    out('##', `${r.letter}  dist:${r.distance}  brg:${r.bearing}  hdg:${r.heading}  ${r.speedDisplay ?? ''}`);
  }
  if (!cells.length && !(sr.sidePanel ?? []).length) out('##', '(scan grid empty)');
}
socket.on('event.log', (p) => out('**', p.text));
socket.on('message.send', (p) => out('[]', `[${p.channel}] ${p.from}: ${p.text}`));
socket.on('combat.ship-destroyed', (p) =>
  out('##', `DESTROYED victim=${p.victimUserid} attacker=${p.attackerName ?? p.attackerId ?? 'none'} weapon=${p.weapon ?? 'none'}`));

// Incoming fire. The gateway sends COMBAT_HIT to the victim's own socket
// (game.gateway.ts:868) and this client did not listen, so a pilot being shot
// saw nothing at all and reported deaths as silent — an instrumentation gap
// mistaken for a game defect across three playtests. A browser client has
// always handled these.
socket.on('combat.hit', (p) =>
  out('><', `HIT ${p.attackerName ?? p.attackerId ?? '?'} -> ${p.victimName ?? p.victimId ?? '?'}`
        + ` ${p.weapon ?? '?'} hull-${Math.round(p.damageHull ?? 0)}% shield-${Math.round(p.damageShield ?? 0)}%`));
socket.on('combat.miss', (p) =>
  out('><', `MISS ${p.weapon ?? '?'} from ${p.attackerId ?? '?'}`));
socket.on('combat.subsystem-damaged', (p) =>
  out('><', `SUBSYSTEM ${p.subsystem ?? '?'} damaged`));

// ── Catch-all ────────────────────────────────────────────────────────────────
//
// The harness was STRUCTURALLY BLIND to three mechanics it was being used to
// test. It subscribed to thirteen events and to none of `cybertron.taunt`,
// `droid.annoy` or `combat.decoy-intercept`, so four rounds of playtesting
// reported silence from features that were firing correctly the whole time.
// That is a worse failure than a missing feature: it manufactures false
// negatives, and we acted on several.
//
// Naming the three would fix today and leave tomorrow's event just as invisible,
// so anything without an explicit handler is printed rather than dropped. A
// noisy line is cheap; a silently discarded one costs a round.
const HANDLED = new Set([
  'connect', 'disconnect', 'connect_error', 'error', 'reconnect_attempt',
  'command:result', 'scan:render', 'event.log', 'message.send',
  'combat.ship-destroyed', 'combat.hit', 'combat.miss', 'combat.subsystem-damaged',
  'prompt:ship-name', 'prompt:ship-select',
]);

socket.onAny((event, payload) => {
  if (HANDLED.has(event)) return;
  const text = payload && typeof payload === 'object' && typeof payload.message === 'string'
    ? payload.message
    : payload && typeof payload === 'object' && typeof payload.text === 'string'
      ? payload.text
      : JSON.stringify(payload ?? null);
  out('**', `[${event}] ${text}`);
});

socket.on('prompt:ship-name', () => {
  out('..', `naming ship ${shipName}`);
  socket.emit('prompt:reply', { value: shipName });
});
socket.on('prompt:ship-select', (p) => {
  const pick = Number(process.env.PERSONA_SHIP_INDEX ?? 1);
  out('..', `fleet: ${(p.ships ?? []).map((s) => `${s.index}:${s.shipname}`).join(' ')} -> ${pick}`);
  socket.emit('prompt:reply', { value: pick });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await new Promise((r) => socket.once('connect', r));
await sleep(2500); // let onboarding settle

for (const raw of script.split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const m = /^wait\s+(\d+(?:\.\d+)?)$/i.exec(line);
  if (m) { out('..', `wait ${m[1]}s`); await sleep(Number(m[1]) * 1000); continue; }
  const r = /^reply\s+(.*)$/i.exec(line);
  if (r) { socket.emit('prompt:reply', { value: r[1] }); await sleep(1500); continue; }

  // `engage [maxDist]` — scan, then fire at the NEAREST contact's actual
  // bearing. Firing at a hard-coded `pha 0` is why four kill tests failed: the
  // target sits wherever it sits, and reading its bearing off the scan is the
  // whole point of the scan. This is what a player does.
  const e = /^engage(?:\s+(\d+))?(?:\s+(\d+|tight))?$/i.exec(line);
  if (e) {
    const maxDist = Number(e[1] ?? 15000);
    out('>>', 'sca lo full');
    socket.emit('command', { input: 'sca lo full' });
    await sleep(2000);
    const target = lastContacts
      .filter((c) => typeof c.bearing === 'number' && c.distance <= maxDist)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!target) { out('..', `engage: no contact within ${maxDist}`); continue; }
    // focus: second directive arg; `tight` (or GE_ENGAGE_FOCUS=tight) uses the
    // one-argument form, which is focus 1 — the strong, narrow beam.
    const focus = e[2] ?? process.env.GE_ENGAGE_FOCUS ?? '5';
    const cmd = focus === 'tight' || focus === '1' ? `pha ${target.bearing}` : `pha ${target.bearing} ${focus}`;
    out('..', `engage: ${target.letter} at ${target.distance} bearing ${target.bearing}`);
    out('>>', cmd);
    socket.emit('command', { input: cmd });
    await sleep(Number(process.env.GE_CMD_DELAY ?? 1600));
    continue;
  }
  out('>>', line);
  socket.emit('command', { input: line });
  await sleep(Number(process.env.GE_CMD_DELAY ?? 1600));
}

await sleep(2500);
socket.close();
process.exit(0);
