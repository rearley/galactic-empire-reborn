import { WIRE_EVENTS } from '@ge/wire';
import {
  COMBAT_PHASER_FIRED,
  COMBAT_HIT,
  COMBAT_MISS,
  COMBAT_DECOY_INTERCEPT,
  COMBAT_MINE_DETONATION,
  COMBAT_SHIP_DESTROYED,
} from '../../src/game/combat/combat-events';
import { CYBERTRON_EVENT } from '../../src/game/cybertron/cybertron-events';
import { DroidEvents } from '../../src/game/droid/droid-events';
import { BEACON_EVENT } from '../../src/gateway/events/beacon.event';

/**
 * The load-bearing parity check: it compares `@ge/wire`'s declared names
 * against the STRING CONSTANTS the running game already emits by, rather than
 * against a copy of the plan's table. A typo in `packages/wire/src/events.ts`
 * fails here even though both files "look right" on inspection.
 *
 * @see packages/wire/test/event-names.spec.ts — the declaration-side check
 * @see docs/superpowers/plans/2026-09-10-restructure-phase-1-wire-contract.md
 */
describe('@ge/wire event names match the backend constants they were moved from', () => {
  it('combat events', () => {
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.COMBAT_PHASER_FIRED).toBe(COMBAT_PHASER_FIRED);
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.COMBAT_HIT).toBe(COMBAT_HIT);
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.COMBAT_MISS).toBe(COMBAT_MISS);
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.COMBAT_DECOY_INTERCEPT).toBe(COMBAT_DECOY_INTERCEPT);
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.COMBAT_MINE_DETONATION).toBe(COMBAT_MINE_DETONATION);
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.COMBAT_SHIP_DESTROYED).toBe(COMBAT_SHIP_DESTROYED);
  });

  it('cybertron events', () => {
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.CYBERTRON_TAUNT).toBe(CYBERTRON_EVENT.TAUNT);
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.CYBERTRON_BROKE_OFF).toBe(CYBERTRON_EVENT.BROKE_OFF);
  });

  it('droid events', () => {
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.DROID_ANNOY).toBe(DroidEvents.ANNOY);
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.DROID_SPAWNED).toBe(DroidEvents.SPAWNED);
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.DROID_KILLED).toBe(DroidEvents.KILLED);
  });

  it('beacon event', () => {
    expect(WIRE_EVENTS.SERVER_TO_CLIENT.BEACON).toBe(BEACON_EVENT);
  });

  it('every server-to-client name is unique', () => {
    const values = Object.values(WIRE_EVENTS.SERVER_TO_CLIENT);
    expect(new Set(values).size).toBe(values.length);
  });

  it('carries exactly 30 server-to-client names and 2 client-to-server names', () => {
    expect(Object.keys(WIRE_EVENTS.SERVER_TO_CLIENT)).toHaveLength(30);
    expect(Object.keys(WIRE_EVENTS.CLIENT_TO_SERVER)).toHaveLength(2);
  });
});
