/**
 * The client stopped narrating deaths, except where canon leaves a gap.
 *
 * Canon's own announcements (KILLEDBY, DIED, YOURDEAD) all reach the client as
 * server `event.log` lines, so anything the client composes on top is a second
 * line about the same death. The one exception is an ion-cannon kill: it takes
 * canon's killer-less branch, so DIED reports the death without naming the
 * colony that made it.
 */
import { describe, it, expect } from 'vitest';
import { destructionLine } from '../src/features/combat/destructionLine';

describe('destructionLine', () => {
  it('says nothing about an ordinary kill — the server sent KILLEDBY', () => {
    expect(destructionLine({ cause: 'phaser', attackerId: 'usr_kil:1' }, 'Defiant')).toBeNull();
  });

  it('says nothing about a killer-less death — the server sent DIED', () => {
    expect(destructionLine({ cause: null, attackerId: null }, 'Defiant')).toBeNull();
  });

  it('never falls back to a name the server did not vet', () => {
    // The old fallback printed event.victimUserid, which for an automaton is
    // the internal Cybrg-NNN account. There is no fallback left to leak it.
    expect(destructionLine({ cause: 'torpedo', attackerId: null }, 'Cybrg-222')).toBeNull();
  });

  it('names the colony on an ion kill, which canon leaves unattributed', () => {
    expect(destructionLine({ cause: 'ion', attackerId: null, attackerName: 'New Ceylon' }, 'Defiant'))
      .toBe('Defiant was destroyed by New Ceylon.');
  });

  it('falls back to a generic defender when the planet is unnamed', () => {
    expect(destructionLine({ cause: 'ion', attackerId: null }, 'Defiant'))
      .toBe('Defiant was destroyed by planetary defences.');
  });
});
