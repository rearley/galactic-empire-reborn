import {
  narratePlanetBeacon,
  narrateShipOverspeed,
  narrateAttackOwnerAlert,
  narrateDestructBlast,
  narrateSystemRepaired,
  narratePhaserCharge,
  narrateStatusNotice,
  narrateCombatMineWarning,
  narrateUniverseEdge,
  narrateShieldCharge,
  narrateSpeedReport,
  narrateWarpProgress,
  narrateEngineShutdown,
  narrateMissileShaken,
  narrateGravity,
  narrateDestructCancelled,
  narrateCloakCollapsed,
} from '../../src/gateway/narration';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { showarp } from '../../src/game/ship/showarp';
import { damstr } from '../../src/game/combat/combat-math';

describe('narratePlanetBeacon', () => {
  it('addresses the pilot and includes the planet number and message', () => {
    expect(narratePlanetBeacon({ shipId: 'rick:1', plnum: 7, message: 'Welcome to Zygor.' } as never)).toEqual({
      room: 'user:rick',
      category: 'info',
      text: '*** Beacon Message from Planet # 7 Welcome to Zygor.',
    });
  });
});

describe('narrateShipOverspeed', () => {
  it('wraps a break event in asterisks', () => {
    expect(narrateShipOverspeed({ shipId: 'rick:1', kind: 'break', text: 'Engines are failing!' } as never)).toEqual({
      room: 'user:rick',
      category: 'combat',
      text: '** Engines are failing! **',
    });
  });

  it('passes a non-break event through unwrapped', () => {
    expect(narrateShipOverspeed({ shipId: 'rick:1', kind: 'strain', text: 'Overspeed strain detected.' } as never)).toEqual({
      room: 'user:rick',
      category: 'combat',
      text: 'Overspeed strain detected.',
    });
  });
});

describe('narrateAttackOwnerAlert', () => {
  it('addresses the planet owner with the raw message', () => {
    expect(narrateAttackOwnerAlert({ ownerUserid: 'rick', message: 'Your colony is under attack!' } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: 'Your colony is under attack!',
    });
  });
});

describe('narrateDestructBlast', () => {
  it('reports the deflected message when shields are up', () => {
    expect(narrateDestructBlast({ victimId: 'rick:1', shieldUp: true, damage: 42 } as never)).toEqual({
      room: 'user:rick',
      category: 'combat',
      text: formatMessage(MessageId.DESTRUCT_BLAST_DEFLECTED, damstr(42)),
    });
  });

  it('reports the direct-hit message when shields are down', () => {
    expect(narrateDestructBlast({ victimId: 'rick:1', shieldUp: false, damage: 77 } as never)).toEqual({
      room: 'user:rick',
      category: 'combat',
      text: formatMessage(MessageId.DESTRUCT_BLAST_HIT, damstr(77)),
    });
  });
});

describe('narrateSystemRepaired', () => {
  it.each([
    ['phaser', MessageId.REPAIR_PHASER],
    ['tactical', MessageId.REPAIR_TACTICAL],
    ['helm', MessageId.REPAIR_HELM],
    ['firecntl', MessageId.REPAIR_FIRECNTL],
  ] as const)('reports the repaired system %s', (system, messageId) => {
    expect(narrateSystemRepaired({ shipId: 'rick:1', system } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: formatMessage(messageId),
    });
  });
});

describe('narratePhaserCharge', () => {
  it('reports minimum power', () => {
    expect(narratePhaserCharge({ shipId: 'rick:1', level: 'minimum' } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: formatMessage(MessageId.PHASER_MIN_POWER),
    });
  });

  it('reports full power for any other level', () => {
    expect(narratePhaserCharge({ shipId: 'rick:1', level: 'full' } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: formatMessage(MessageId.PHASER_FULL_POWER),
    });
  });
});

describe('narrateStatusNotice', () => {
  it.each([
    ['shields-no-power', MessageId.SHIELDS_NO_POWER],
    ['shields-repaired', MessageId.SHIELDS_REPAIRED],
    ['cloak-full', MessageId.CLOAK_FULL],
    ['cloak-repaired', MessageId.CLOAK_REPAIRED],
    ['maint-complete', MessageId.MAINT_COMPLETE],
    ['maint-interrupted', MessageId.MAINT_INTERRUPTED],
  ] as const)('reports notice %s', (notice, messageId) => {
    expect(narrateStatusNotice({ shipId: 'rick:1', notice } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: formatMessage(messageId),
    });
  });
});

describe('narrateCombatMineWarning', () => {
  it('reports bearing and distance to the victim', () => {
    expect(narrateCombatMineWarning({ victimId: 'rick:1', bearing: 45, distance: 12 } as never)).toEqual({
      room: 'user:rick',
      category: 'combat',
      text: formatMessage(MessageId.MINE6, 45, 12),
    });
  });
});

describe('narrateUniverseEdge', () => {
  it('addresses the pilot by user room and reports the hull damage', () => {
    expect(narrateUniverseEdge({ shipId: 'rick:1', damage: 42 } as never)).toEqual({
      room: 'user:rick',
      category: 'combat',
      text: '** You strike the galactic perimeter. All way comes off and the hull takes 42 damage. **',
    });
  });
});

describe('narrateShieldCharge', () => {
  it('reports SHLDUP at full charge', () => {
    // This `percent` is shield charge (0-100 inclusive), not the unrelated
    // `imp` command's percent field the fixture-domains guard's `percent`
    // domain is keyed for.
    // domain-ok: 100 is a real, full-charge value.
    expect(narrateShieldCharge({ shipId: 'rick:1', kind: 'full', percent: 100 } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: formatMessage(MessageId.SHLDUP),
    });
  });

  it('reports SHLDAT with the percentage while charging', () => {
    expect(narrateShieldCharge({ shipId: 'rick:1', kind: 'charging', percent: 60 } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: formatMessage(MessageId.SHLDAT, 60),
    });
  });
});

describe('narrateSpeedReport', () => {
  it('reports SPEED0 on a dead stop', () => {
    expect(narrateSpeedReport({ userid: 'rick', speed: 0 } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: formatMessage(MessageId.SPEED0),
    });
  });

  it('renders a live speed through showarp, not as a split number', () => {
    // SPEEDIS takes ONE arg — canon's showarp figure. The port once split the
    // number and printed "warp 10 point 00" — the citation for this lives on
    // narrateSpeedReport itself, in src/gateway/narration.ts.
    expect(narrateSpeedReport({ userid: 'rick', speed: 3 } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: formatMessage(MessageId.SPEEDIS, showarp(3)),
    });
  });
});

describe('narrateWarpProgress', () => {
  it('reports the warp rung crossed', () => {
    expect(narrateWarpProgress({ userid: 'rick', warp: 5 } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: formatMessage(MessageId.HELM_WARP, 5),
    });
  });
});

describe('narrateEngineShutdown', () => {
  it('reports the raw speed at shutdown, uncorrected, as alert category', () => {
    expect(narrateEngineShutdown({ userid: 'rick', speed: 3000 } as never)).toEqual({
      room: 'user:rick',
      category: 'alert',
      text: formatMessage(MessageId.HELM_NOACCEL, 3000),
    });
  });
});

describe('narrateMissileShaken', () => {
  it('reports MISSL2', () => {
    expect(narrateMissileShaken({ userid: 'rick' } as never)).toEqual({
      room: 'user:rick',
      category: 'combat',
      text: formatMessage(MessageId.MISSL2),
    });
  });
});

describe('narrateGravity', () => {
  it('warns on band 1, naming a planet', () => {
    expect(narrateGravity({ shipId: 'rick:1', plnum: 3, isWormhole: false, band: 1 } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: 'You feel the pull of planet 3.',
    });
  });

  it('warns to break away on band 2', () => {
    expect(narrateGravity({ shipId: 'rick:1', plnum: 3, isWormhole: false, band: 2 } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: 'WARNING: planet 3 is dragging you in — break away now.',
    });
  });

  it('reports a wormhole taking the ship on band 3', () => {
    expect(narrateGravity({ shipId: 'rick:1', plnum: 1, isWormhole: true, band: 3 } as never)).toEqual({
      room: 'user:rick',
      category: 'combat',
      text: 'The wormhole takes you.',
    });
  });

  it('reports flying into a planet on band 3', () => {
    expect(narrateGravity({ shipId: 'rick:1', plnum: 1, isWormhole: false, band: 3 } as never)).toEqual({
      room: 'user:rick',
      category: 'combat',
      text: 'You have flown into planet 1.',
    });
  });

  it('names a wormhole on band 1', () => {
    expect(narrateGravity({ shipId: 'rick:1', plnum: 9, isWormhole: true, band: 1 } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: 'You feel the pull of wormhole 9.',
    });
  });
});

describe('narrateDestructCancelled', () => {
  it('tells the captain neutral space cancelled the countdown', () => {
    expect(narrateDestructCancelled({ shipId: 'rick:1' } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: 'Entering neutral space — the self-destruct sequence has been cancelled.',
    });
  });
});

describe('narrateCloakCollapsed', () => {
  it('addresses the pilot with the raw message', () => {
    expect(narrateCloakCollapsed({ userid: 'rick', message: 'Your cloak has collapsed!' } as never)).toEqual({
      room: 'user:rick',
      category: 'system',
      text: 'Your cloak has collapsed!',
    });
  });
});
