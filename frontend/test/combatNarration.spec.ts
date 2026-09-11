/**
 * The combat narration decisions, tested directly rather than by omission.
 *
 * These functions mostly decide to say NOTHING, and each silence is a canon
 * derivation: a bystander is shown nothing about someone else's weapons fire,
 * the server already relays canon's own text to a hit's victim, and canon
 * narrates a phaser hit to the firer itself. The rest of the suite asserts
 * those by `queryByText(...)).toBeNull()` through a rendered App, which passes
 * just as happily when a handler is deleted as when it is correct. Here every
 * silence is a named case, because a silence that becomes a line is this
 * module's failure mode.
 */
import { describe, it, expect } from 'vitest';
import {
  combatHitLine,
  phaserFiredLine,
  type CombatHitNarrationEvent,
  type NarrationContext,
} from '../src/features/combat/combatNarration';

const LOCAL = 'usr_me:1';

const ctx: NarrationContext = {
  localShipId: LOCAL,
  shipName: (shipId: string) => shipId.split(':')[0],
};

const hit = (over: Partial<CombatHitNarrationEvent> = {}): CombatHitNarrationEvent => ({
  attackerId: 'Cybrg-208:1',
  attackerName: 'Cybertron 43319',
  victimId: 'other:1',
  victimName: 'Wanderer',
  weapon: 'torpedo',
  damageHull: 10,
  damageShield: 0,
  ...over,
});

describe('phaserFiredLine', () => {
  it('says nothing to a bystander — canon shows them no one else\'s weapons fire', () => {
    // PFIRED goes outprfge(FILTER, usrn) — to the firer alone. @see GECMDS.C:943-944
    expect(phaserFiredLine({ shipId: 'Cybrg-208:1' }, ctx)).toBeNull();
  });

  it('says nothing to the firer either — the server relays canon\'s PFIRED', () => {
    expect(phaserFiredLine({ shipId: LOCAL }, ctx)).toBeNull();
  });

  it('says nothing when the viewer has no ship yet', () => {
    expect(phaserFiredLine({ shipId: 'Cybrg-208:1' }, { ...ctx, localShipId: null })).toBeNull();
  });
});

describe('combatHitLine', () => {
  it('says nothing to the victim — the gateway already relays canon\'s own text', () => {
    // THIT1/THIT2, MHIT1/MHIT2, PHITYOU/PHITDEF, MINE4 arrive on event.log.
    expect(combatHitLine(hit({ victimId: LOCAL, weapon: 'torpedo' }), ctx)).toBeNull();
  });

  it('says nothing about a phaser the local ship fired — canon narrates it to the firer', () => {
    // PHITHIM / PDEFLECT, GECMDS.C:985-995, relayed by the gateway.
    expect(combatHitLine(hit({ attackerId: LOCAL, weapon: 'phaser' }), ctx)).toBeNull();
  });

  it('says nothing about a hyper-phaser the local ship fired, for the same reason', () => {
    expect(combatHitLine(hit({ attackerId: LOCAL, weapon: 'hyper-phaser' }), ctx)).toBeNull();
  });

  it('says nothing about a fight between two other ships', () => {
    expect(combatHitLine(hit(), ctx)).toBeNull();
  });

  it('says nothing about a ship hitting itself — the victim branch is tested first', () => {
    // A mine you laid, or your own colony's cannons: victim wins over attacker,
    // so the server's own text stands alone rather than being confirmed twice.
    expect(combatHitLine(hit({ attackerId: LOCAL, victimId: LOCAL, weapon: 'mine' }), ctx)).toBeNull();
  });

  it('says nothing when the viewer has no ship — nobody\'s fight is theirs', () => {
    expect(combatHitLine(hit({ attackerId: LOCAL }), { ...ctx, localShipId: null })).toBeNull();
  });

  it('confirms a torpedo strike for ordnance the local ship fired', () => {
    expect(combatHitLine(hit({ attackerId: LOCAL, weapon: 'torpedo', damageHull: 23 }), ctx))
      .toEqual({ text: 'Sensors confirm a torpedo strike on Wanderer.', category: 'combat' });
  });

  it('confirms a missile strike the same way', () => {
    expect(combatHitLine(hit({ attackerId: LOCAL, weapon: 'missile', damageHull: 40 }), ctx))
      .toEqual({ text: 'Sensors confirm a missile strike on Wanderer.', category: 'combat' });
  });

  it('never reports a damage figure — canon reports hull damage as a number nowhere', () => {
    const line = combatHitLine(hit({ attackerId: LOCAL, weapon: 'torpedo', damageHull: 23, damageShield: 15 }), ctx);
    expect(line?.text).not.toContain('%');
    expect(line?.text).not.toContain('23');
    expect(line?.text).not.toContain('15');
  });

  it('prefers the server-resolved victim name, because the roster excludes AI', () => {
    // Falling back to the key would print a userid ("Cybrg-222") that no command
    // accepts — `sca sh` wants the ship name.
    expect(combatHitLine(hit({ attackerId: LOCAL, victimId: 'Cybrg-222:1', victimName: 'Cybertron 43319' }), ctx)?.text)
      .toBe('Sensors confirm a torpedo strike on Cybertron 43319.');
  });

  it('falls back to the context lookup when the server resolved no victim name', () => {
    expect(combatHitLine(hit({ attackerId: LOCAL, victimId: 'other:1', victimName: undefined }), ctx)?.text)
      .toBe('Sensors confirm a torpedo strike on other.');
  });
});
