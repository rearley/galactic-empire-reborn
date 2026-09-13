import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import type { CombatHitEvent, CombatPhaserFiredEvent } from '../../src/game/combat/combat-events';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { makeGateway } from '../helpers/make-gateway';

/**
 * `combat.hit` and `combat.phaser-fired` must carry what the client renders,
 * and nothing else.
 *
 * Both used their INTERNAL domain event as the wire payload and were emitted by
 * spread, so each one published the firing ship's exact sector — `combat.hit`
 * to a whole sector room and, when the victim stood elsewhere, directly to a
 * pilot who had no other way to learn where the shot came from. A live position
 * feed on anyone who fights, which is the disclosure `combat.ship-destroyed`
 * was narrowed to close on 2026-09-09; these two never got the same treatment.
 *
 * The client reads, via `features/combat/combatNarration.ts`:
 *   combat.hit           attackerId, attackerName, victimId, victimName,
 *                        weapon, damageHull, damageShield
 *   combat.phaser-fired  shipId (and the firer's own bearing/percent/hyper,
 *                        which are that pilot's own instrument readings)
 *
 * @see issue #4  @see test/gateway/destroyed-payload-scoping.spec.ts
 */
describe('combat.hit and combat.phaser-fired carry only what the client renders', () => {
  const build = () => {
    const emitted: Array<{ room: string | null; event: string; payload: Record<string, unknown> }> = [];
    const gateway = makeGateway({
      shipStateService: {
        get: (userid: string, shipno: number) =>
          ({ userid, shipno, shipname: userid === 'usr_killer' ? 'WildCat' : 'Ranger', items: [] }),
        findAllShips: () => [],
      } as unknown as ShipStateService,
      // `lettersFor` returns the victim's scan table as an array of entries.
      scanHandler: { lettersFor: () => [] } as unknown as ScanHandlerService,
    });
    (gateway as unknown as { server: unknown }).server = {
      emit: (event: string, payload: Record<string, unknown>) => { emitted.push({ room: null, event, payload }); },
      to: (room: string) => ({
        emit: (event: string, payload: Record<string, unknown>) => { emitted.push({ room, event, payload }); },
      }),
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    (gateway as unknown as { registry: unknown }).registry = { getSocketId: () => undefined };
    return { gateway, emitted };
  };

  const SECTOR = { x: -12, y: 40 };

  const hit = (gateway: GameGateway, extra: Partial<CombatHitEvent> = {}) =>
    (gateway as unknown as { handleCombatHit: (e: CombatHitEvent) => void }).handleCombatHit({
      attackerId: 'usr_killer:1',
      victimId: 'usr_victim:2',
      weapon: 'phaser',
      damageHull: 12,
      damageShield: 0,
      sector: SECTOR,
      tickAt: new Date(),
      ...extra,
    } as CombatHitEvent);

  const fired = (gateway: GameGateway) =>
    (gateway as unknown as { handleCombatPhaserFired: (e: CombatPhaserFiredEvent) => void }).handleCombatPhaserFired({
      shipId: 'usr_killer:1',
      bearing: 90,
      percent: 75,
      hyper: false,
      sector: SECTOR,
      tickAt: new Date(),
    } as CombatPhaserFiredEvent);

  const payloadFor = (
    emitted: Array<{ event: string; payload: Record<string, unknown> }>,
    event: string,
  ) => emitted.find((e) => e.event === event)?.payload ?? {};

  it('still gives the client every field the hit narration reads', () => {
    const { gateway, emitted } = build();
    hit(gateway);
    const p = payloadFor(emitted, 'combat.hit');

    expect(p.attackerId).toBe('usr_killer:1');
    expect(p.victimId).toBe('usr_victim:2');
    expect(p.weapon).toBe('phaser');
    expect(p.damageHull).toBe(12);
    expect(p.damageShield).toBe(0);
    expect(p).toHaveProperty('attackerName');
    expect(p).toHaveProperty('victimName');
  });

  it('does not tell a sector room where the shot came from', () => {
    const { gateway, emitted } = build();
    hit(gateway);
    const p = payloadFor(emitted, 'combat.hit');

    expect(p).not.toHaveProperty('sector');
    expect(JSON.stringify(p)).not.toContain('-12');
    expect(JSON.stringify(p)).not.toContain('40');
  });

  it('does not ship the internal tick timestamp on a hit', () => {
    const { gateway, emitted } = build();
    hit(gateway);
    expect(payloadFor(emitted, 'combat.hit')).not.toHaveProperty('tickAt');
  });

  it('gives the firer their own instrument readings', () => {
    const { gateway, emitted } = build();
    fired(gateway);
    const p = payloadFor(emitted, 'combat.phaser-fired');

    expect(p.shipId).toBe('usr_killer:1');
    expect(p.bearing).toBe(90);
    expect(p.percent).toBe(75);
    expect(p.hyper).toBe(false);
    expect(p).toHaveProperty('shipName');
  });

  it('does not ship sector or tick internals on a phaser discharge', () => {
    const { gateway, emitted } = build();
    fired(gateway);
    const p = payloadFor(emitted, 'combat.phaser-fired');

    expect(p).not.toHaveProperty('sector');
    expect(p).not.toHaveProperty('tickAt');
  });
});
