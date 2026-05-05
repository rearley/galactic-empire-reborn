/**
 * T028 — Annoy message pool: structural and behavioral tests.
 *
 * Verifies that MESSAGE_POOLS contains all required keys, that each
 * class × variant slice is non-empty, and that pickAnnoy draws only from
 * the correct slice and substitutes %s with the ship name.
 *
 * @see GEDROIDS.C:237 droid_annoy — first+gernd()%(last-first+1)
 * @see GEDROIDS.C:droid_act_class_10 — DRDMSG6 (Scow, passive only)
 * @see GEDROIDS.C:droid_act_class_11 — DRDMSG11..15 / DRDHLP11..15 (Transport)
 * @see GEDROIDS.C:droid_act_class_12 — DRDMSG1..5 / DRDHLP1..5 (Vakory)
 * @see specs/008-droid-ai/tasks.md T028
 */
import { Mulberry32Adapter } from '../../../src/game/combat/random.port';
import { pickAnnoy, MESSAGE_POOLS } from '../../../src/game/droid/droid-message-pool';

function seeded(seed: number): Mulberry32Adapter {
  return new Mulberry32Adapter(seed);
}

// ─── T028: MESSAGE_POOLS structure ────────────────────────────────────────────

describe('MESSAGE_POOLS structure (T028)', () => {
  it('exports all required pool keys', () => {
    expect(MESSAGE_POOLS).toHaveProperty('SCOW_PASSIVE');
    expect(MESSAGE_POOLS).toHaveProperty('MURDONIAN_PASSIVE');
    expect(MESSAGE_POOLS).toHaveProperty('MURDONIAN_HELP');
    expect(MESSAGE_POOLS).toHaveProperty('VAKORY_PASSIVE');
    expect(MESSAGE_POOLS).toHaveProperty('VAKORY_HELP');
  });

  it('SCOW_PASSIVE slice is non-empty (class 31, passive)', () => {
    expect(MESSAGE_POOLS.SCOW_PASSIVE.length).toBeGreaterThan(0);
  });

  it('MURDONIAN_PASSIVE slice is non-empty (class 32, passive)', () => {
    expect(MESSAGE_POOLS.MURDONIAN_PASSIVE.length).toBeGreaterThan(0);
  });

  it('MURDONIAN_HELP slice is non-empty (class 32, help)', () => {
    expect(MESSAGE_POOLS.MURDONIAN_HELP.length).toBeGreaterThan(0);
  });

  it('VAKORY_PASSIVE slice is non-empty (class 33, passive)', () => {
    expect(MESSAGE_POOLS.VAKORY_PASSIVE.length).toBeGreaterThan(0);
  });

  it('VAKORY_HELP slice is non-empty (class 33, help)', () => {
    expect(MESSAGE_POOLS.VAKORY_HELP.length).toBeGreaterThan(0);
  });

  it('all messages contain a %s placeholder before substitution', () => {
    for (const [key, pool] of Object.entries(MESSAGE_POOLS)) {
      for (const msg of pool) {
        if (!msg.includes('%s')) {
          throw new Error(`Pool "${key}" has message without %s: "${msg}"`);
        }
      }
    }
  });
});

// ─── T028: pickAnnoy draws from the correct slice ─────────────────────────────

describe('pickAnnoy draws from the correct slice (T028)', () => {
  const SCOW_SHIP = 'Garbage-Scow-1';
  const TRANSPORT_SHIP = 'MurdonianFreighter-1';
  const VAKORY_SHIP = 'SurveyDrone-1';

  it('class 31 passive — result is in SCOW_PASSIVE after substitution', () => {
    for (let seed = 0; seed < 20; seed++) {
      const msg = pickAnnoy(31, 'passive', SCOW_SHIP, seeded(seed));
      const expectedMessages = MESSAGE_POOLS.SCOW_PASSIVE.map((m) => m.replace('%s', SCOW_SHIP));
      expect(expectedMessages).toContain(msg);
    }
  });

  it('class 32 passive — result is in MURDONIAN_PASSIVE after substitution', () => {
    for (let seed = 0; seed < 20; seed++) {
      const msg = pickAnnoy(32, 'passive', TRANSPORT_SHIP, seeded(seed));
      const expectedMessages = MESSAGE_POOLS.MURDONIAN_PASSIVE.map((m) => m.replace('%s', TRANSPORT_SHIP));
      expect(expectedMessages).toContain(msg);
    }
  });

  it('class 32 help — result is in MURDONIAN_HELP after substitution', () => {
    for (let seed = 0; seed < 20; seed++) {
      const msg = pickAnnoy(32, 'help', TRANSPORT_SHIP, seeded(seed));
      const expectedMessages = MESSAGE_POOLS.MURDONIAN_HELP.map((m) => m.replace('%s', TRANSPORT_SHIP));
      expect(expectedMessages).toContain(msg);
    }
  });

  it('class 33 passive — result is in VAKORY_PASSIVE after substitution', () => {
    for (let seed = 0; seed < 20; seed++) {
      const msg = pickAnnoy(33, 'passive', VAKORY_SHIP, seeded(seed));
      const expectedMessages = MESSAGE_POOLS.VAKORY_PASSIVE.map((m) => m.replace('%s', VAKORY_SHIP));
      expect(expectedMessages).toContain(msg);
    }
  });

  it('class 33 help — result is in VAKORY_HELP after substitution', () => {
    for (let seed = 0; seed < 20; seed++) {
      const msg = pickAnnoy(33, 'help', VAKORY_SHIP, seeded(seed));
      const expectedMessages = MESSAGE_POOLS.VAKORY_HELP.map((m) => m.replace('%s', VAKORY_SHIP));
      expect(expectedMessages).toContain(msg);
    }
  });

  it('class 32 passive — result does NOT come from MURDONIAN_HELP pool', () => {
    const helpMessages = new Set(
      MESSAGE_POOLS.MURDONIAN_HELP.map((m) => m.replace('%s', TRANSPORT_SHIP)),
    );
    for (let seed = 0; seed < 50; seed++) {
      const msg = pickAnnoy(32, 'passive', TRANSPORT_SHIP, seeded(seed));
      expect(helpMessages.has(msg)).toBe(false);
    }
  });

  it('class 33 passive — result does NOT come from VAKORY_HELP pool', () => {
    const helpMessages = new Set(
      MESSAGE_POOLS.VAKORY_HELP.map((m) => m.replace('%s', VAKORY_SHIP)),
    );
    for (let seed = 0; seed < 50; seed++) {
      const msg = pickAnnoy(33, 'passive', VAKORY_SHIP, seeded(seed));
      expect(helpMessages.has(msg)).toBe(false);
    }
  });
});

// ─── T028: %s substitution ────────────────────────────────────────────────────

describe('pickAnnoy substitutes %s with shipname (T028)', () => {
  it('substitutes the ship name correctly for a Scow', () => {
    const name = 'Junk-Hauler';
    const msg = pickAnnoy(31, 'passive', name, seeded(0));
    expect(msg).toContain(name);
    expect(msg).not.toContain('%s');
  });

  it('substitutes the ship name correctly for a Murdonian Transport', () => {
    const name = 'Heavy-Freighter';
    const msg = pickAnnoy(32, 'passive', name, seeded(0));
    expect(msg).toContain(name);
    expect(msg).not.toContain('%s');
  });

  it('substitutes the ship name correctly for Murdonian help variant', () => {
    const name = 'Convoy-Leader';
    const msg = pickAnnoy(32, 'help', name, seeded(0));
    expect(msg).toContain(name);
    expect(msg).not.toContain('%s');
  });

  it('substitutes the ship name correctly for a Vakory Drone', () => {
    const name = 'Survey-Unit-Alpha';
    const msg = pickAnnoy(33, 'passive', name, seeded(0));
    expect(msg).toContain(name);
    expect(msg).not.toContain('%s');
  });

  it('substitutes the ship name correctly for Vakory help variant', () => {
    const name = 'Scanner-Delta';
    const msg = pickAnnoy(33, 'help', name, seeded(0));
    expect(msg).toContain(name);
    expect(msg).not.toContain('%s');
  });
});

// ─── T028: seeded determinism ─────────────────────────────────────────────────

describe('pickAnnoy is deterministic with same seed (T028)', () => {
  it('same seed produces same message for class 32 passive', () => {
    const msg1 = pickAnnoy(32, 'passive', 'TestShip', seeded(777));
    const msg2 = pickAnnoy(32, 'passive', 'TestShip', seeded(777));
    expect(msg1).toBe(msg2);
  });

  it('same seed produces same message for class 33 help', () => {
    const msg1 = pickAnnoy(33, 'help', 'TestShip', seeded(42));
    const msg2 = pickAnnoy(33, 'help', 'TestShip', seeded(42));
    expect(msg1).toBe(msg2);
  });
});
