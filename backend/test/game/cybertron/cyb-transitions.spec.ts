import type { Random } from '../../../src/game/combat/random.port';
import { CYBMINE_NONE } from '../../../src/game/ship/ship-channel.registry';
import {
  acquire,
  hydrate,
  idleCadence,
  provoke,
  releaseBreakOff,
  releaseDeadTarget,
  releaseNoTarget,
  releaseStale,
  releaseTargetCloaked,
  releaseTargetLeft,
  releaseWon,
  releaseZoneEntry,
  type CybClaimState,
} from '../../../src/game/cybertron/cyb-transitions';

/**
 * One function per Cybertron claim transition, each writing canon's COMPLETE
 * field set and nothing else.
 *
 * Every test asserts the whole object, not the field under discussion, because
 * the defect this module exists to prevent is a transition that writes a subset:
 * four in one day, v0.27.4-v0.27.8, each a claim that changed without its
 * companions. Scripted `Random` sequences pin the draw ORDER as well, since
 * reordering two draws is a gameplay change nobody would see in a diff.
 * @see issue #59, docs/DECISIONS.md 2026-09-20
 */
const seq = (...xs: number[]): Random => {
  let i = 0;
  return {
    next: () => {
      if (i >= xs.length) throw new Error(`unexpected draw #${i + 1}`);
      return xs[i++];
    },
  };
};

type Ship = CybClaimState & { status: number; topspeed: number };
const base = (): Ship => ({
  cybmine: 7,
  speed2b: 284,
  head2b: 90,
  holdcourse: 3,
  cybupdate: 40,
  tick: 12,
  status: 2,
  topspeed: 4,
});

describe('provoke — a hit turns an AI on the shooter', () => {
  const wasp = { channel: 18, userid: 'pilot_Wasp', shipno: 1 };

  it('writes the claim on an AI ship — the channel, and who holds it — and nothing else', () => {
    const s = base();
    provoke(s, wasp);
    expect(s).toEqual({ ...base(), cybmine: 18, cybmineKey: 'pilot_Wasp:1' });
  });

  it('leaves a player ship alone', () => {
    const s = { ...base(), status: 1 };
    provoke(s, wasp);
    expect(s).toEqual({ ...base(), status: 1 });
  });
});

describe('acquire', () => {
  it('writes the claim only; the pursuit band steers separately', () => {
    const s = { ...base(), cybmine: CYBMINE_NONE };
    acquire(s, { channel: 4, userid: 'pilot_Ace', shipno: 1 });
    expect(s).toEqual({ ...base(), cybmine: 4, cybmineKey: 'pilot_Ace:1' });
  });
});

describe('releaseTargetLeft', () => {
  it('clears the claim and cruises at a random speed', () => {
    const s = base();
    releaseTargetLeft(s, 4000, seq(0.25));
    expect(s).toEqual({ ...base(), cybmine: CYBMINE_NONE, speed2b: 1000 });
  });
});

describe('every release forgets WHO it claimed, not just the channel (#64)', () => {
  const keyed = (): Ship => ({ ...base(), cybmineKey: 'pilot_Wasp:1' });
  it.each([
    ['releaseTargetLeft', (s: Ship) => releaseTargetLeft(s, 4000, seq(0.25))],
    ['releaseTargetCloaked, on its 1-in-10', (s: Ship) => releaseTargetCloaked(s, 4000, seq(0.5, 0.25, 0.05))],
    ['releaseZoneEntry', (s: Ship) => releaseZoneEntry(s, 4000, seq(0.5, 0.5))],
    ['releaseBreakOff', (s: Ship) => releaseBreakOff(s, 4000)],
    ['releaseNoTarget', (s: Ship) => releaseNoTarget(s)],
    ['releaseStale', (s: Ship) => releaseStale(s)],
    ['releaseDeadTarget', (s: Ship) => releaseDeadTarget(s)],
    ['releaseWon', (s: Ship) => releaseWon(s)],
    ['hydrate', (s: Ship) => hydrate(s)],
  ])('%s', (_name, release) => {
    const s = keyed();
    release(s);
    expect(s.cybmineKey).toBeUndefined();
  });

  it('but a cloaked target kept on the other nine keeps its key too', () => {
    const s = keyed();
    releaseTargetCloaked(s, 4000, seq(0.5, 0.25, 0.5));
    expect(s.cybmineKey).toBe('pilot_Wasp:1');
  });
});

describe('releaseTargetCloaked', () => {
  it('holds course, then cruises, then gives up on a 1-in-10 roll — in that order', () => {
    const s = base();
    releaseTargetCloaked(s, 4000, seq(0.5, 0.25, 0.05));
    expect(s).toEqual({ ...base(), holdcourse: 7, speed2b: 1000, cybmine: CYBMINE_NONE });
  });

  it('keeps the claim on the other nine', () => {
    const s = base();
    releaseTargetCloaked(s, 4000, seq(0.5, 0.25, 0.5));
    expect(s).toEqual({ ...base(), holdcourse: 7, speed2b: 1000 });
  });
});

describe('releaseZoneEntry', () => {
  it('clears the claim and re-rolls speed then heading', () => {
    const s = base();
    releaseZoneEntry(s, 4000, seq(0.5, 0.5));
    expect(s).toEqual({ ...base(), cybmine: CYBMINE_NONE, speed2b: 2000, head2b: 179.95 });
  });
});

describe('releaseBreakOff', () => {
  it('clears the claim and runs at top speed', () => {
    const s = base();
    releaseBreakOff(s, 4000);
    expect(s).toEqual({ ...base(), cybmine: CYBMINE_NONE, speed2b: 4000 });
  });
});

describe('releaseNoTarget', () => {
  it('parks the activation and clears the claim, leaving the course alone', () => {
    const s = base();
    releaseNoTarget(s);
    expect(s).toEqual({ ...base(), tick: 255, cybmine: CYBMINE_NONE });
  });
});

describe('releaseStale', () => {
  it('clears the claim only', () => {
    const s = base();
    releaseStale(s);
    expect(s).toEqual({ ...base(), cybmine: CYBMINE_NONE });
  });
});

describe('releaseDeadTarget', () => {
  it('clears the claim only', () => {
    const s = base();
    releaseDeadTarget(s);
    expect(s).toEqual({ ...base(), cybmine: CYBMINE_NONE });
  });
});

describe('releaseWon', () => {
  it('clears the claim, settles to warp 2 and forces the next flush', () => {
    const s = base();
    releaseWon(s);
    expect(s).toEqual({ ...base(), cybmine: CYBMINE_NONE, speed2b: 2000, cybupdate: 0 });
  });
});

describe('idleCadence — db_update', () => {
  it('counts down without touching the course', () => {
    const s = base();
    idleCadence(s, 4000, seq());
    expect(s).toEqual({ ...base(), cybupdate: 39 });
  });

  it('at 1, re-arms the cadence and leaves a claimed ship on its course', () => {
    const s = { ...base(), cybupdate: 1 };
    idleCadence(s, 4000, seq(0.5));
    expect(s).toEqual({ ...base(), cybupdate: 150 });
  });

  it('at 1, re-rolls speed then heading for an unclaimed ship', () => {
    const s = { ...base(), cybupdate: 1, cybmine: CYBMINE_NONE };
    idleCadence(s, 4000, seq(0.5, 0.5, 0.5));
    expect(s).toEqual({
      ...base(),
      cybmine: CYBMINE_NONE,
      speed2b: 2000,
      head2b: 179.95,
      cybupdate: 150,
    });
  });

  it('at 0, does nothing', () => {
    const s = { ...base(), cybupdate: 0 };
    idleCadence(s, 4000, seq());
    expect(s).toEqual({ ...base(), cybupdate: 0 });
  });
});

describe('hydrate — cyb_init load', () => {
  it('makes a loaded ship an unclaimed AI at cruise, whatever it was holding', () => {
    const s = { ...base(), status: 0 };
    hydrate(s);
    expect(s).toEqual({
      ...base(),
      status: 2,
      cybmine: CYBMINE_NONE,
      holdcourse: 0,
      speed2b: 4000,
    });
  });

  it('gives a Base Star, topspeed 0, speed 0', () => {
    const s = { ...base(), topspeed: 0 };
    hydrate(s);
    expect(s.speed2b).toBe(0);
  });
});
