/**
 * T055 — death-broadcast: GameGateway forwards COMBAT_SHIP_DESTROYED to
 * EVERY connected client (server.emit) — NOT scoped to the victim's sector
 * room. Per FR-031 / R-7 the original game broadcasts ship destruction
 * galaxy-wide.
 *
 * @see specs/006b-combat/tasks.md T055
 */
import 'reflect-metadata';
import { GameGateway } from '../../../src/gateway/game.gateway';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { ConnectedShipsRegistry } from '../../../src/gateway/connected-ships.registry';
import { WsAuthGuard } from '../../../src/auth/ws-auth.guard';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { OnboardingService } from '../../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../../fixtures/mock-random';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';

describe('GameGateway — COMBAT_SHIP_DESTROYED broadcast (T055)', () => {
  let gateway: GameGateway;
  let toMock: jest.Mock;
  let serverEmitMock: jest.Mock;

  beforeEach(() => {
    toMock = jest.fn().mockReturnValue({ emit: jest.fn() });
    serverEmitMock = jest.fn();

    const mockWsGuard = { validate: jest.fn() } as unknown as WsAuthGuard;
    const mockPrisma = {
      ship: { findFirst: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrismaService;
    const mockOnboarding = { buildClassListPayload: jest.fn().mockResolvedValue([]) } as unknown as OnboardingService;
    const mockScanHandler = { clearScantab: jest.fn() } as unknown as ScanHandlerService;
    const mockShipState = { removeFromGame: jest.fn(), get: jest.fn().mockReturnValue(undefined) } as unknown as ShipStateService;
    gateway = new GameGateway(mockShipState, {} as CommandRouterService, {} as ConnectedShipsRegistry, mockWsGuard, mockPrisma, mockOnboarding, mockScanHandler, { getTypeName: jest.fn() } as never, mockRandom, { emit: jest.fn(), on: jest.fn() } as never);
    (gateway as unknown as { server: { to: jest.Mock; emit: jest.Mock } }).server = {
      to: toMock,
      emit: serverEmitMock,
    };
  });

  it('emits galaxy-wide via server.emit (no room filter)', () => {
    const event: CombatShipDestroyedEvent = {
      victimId: 'b:2',
      attackerId: 'a:7',
      victimShipKey: 'b:2',
      attackerShipKey: 'a:7',
      victimUserid: 'b',
      attackerUserid: 'a',
      attackerChannel: 7,
      weapon: null,
      sector: { x: 12, y: 3 },
      tickAt: new Date(),
      loot: [],
      scoreAwarded: 0,
    };
    gateway.handleCombatShipDestroyed(event);
    // `attackerName` is added by the gateway: it names the planet when a kill
    // has no attacking ship (an ion-cannon kill), and is null otherwise.
    expect(serverEmitMock).toHaveBeenCalledWith(COMBAT_SHIP_DESTROYED, { ...event, attackerName: null });
    // The DESTRUCTION notice stays galaxy-wide and unfiltered. The only
    // targeted emit is YOURDEAD to the victim, which C sends with
    // outprfge(ALWAYS,usrn) — it tells them they escaped and are back at
    // Zygor, and it is addressed to them alone.
    // @see GEFUNCS.C:978-987, MBMGEMSG.MSG:1828-1840
    expect(toMock).toHaveBeenCalledTimes(1);
    expect(toMock).toHaveBeenCalledWith('user:b');
  });

  it('payload is forwarded intact, plus the planet-kill attribution field', () => {
    const tickAt = new Date('2026-01-01T00:00:00Z');
    const event: CombatShipDestroyedEvent = {
      victimId: 'x:1',
      attackerId: null,
      victimShipKey: 'x:1',
      attackerShipKey: null,
      victimUserid: 'x',
      attackerUserid: null,
      attackerChannel: 99,
      weapon: null,
      sector: { x: 0, y: 0 },
      tickAt,
      loot: [],
      scoreAwarded: 0,
    };
    gateway.handleCombatShipDestroyed(event);
    expect(serverEmitMock).toHaveBeenCalledTimes(1);
    expect(serverEmitMock.mock.calls[0][1]).toStrictEqual({ ...event, attackerName: null });
  });

  /**
   * The colony that made the kill must be named. `fireion` sets the victim's
   * `lastfired` to -1 so no attacking ship resolves (GEFUNCS.C:1796), which
   * left an ion kill carrying no attacker and no weapon — the same shape a
   * self-destruct produces — and the client announced it as "destroyed by
   * unknown". The gateway is the only layer that sees both the ion hit (which
   * knows the planet) and the kill, so it carries the name across.
   */
  it('names the planet that killed a besieging ship', () => {
    gateway.handlePlanetIonFired({
      shipId: 'raider:2',
      plnum: 1,
      planetName: 'Aurelia-Landing',
      hullDamage: 98,
      shieldKnock: 0,
      shieldsUp: false,
    });

    const event: CombatShipDestroyedEvent = {
      victimId: 'raider:2',
      attackerId: null,
      victimShipKey: 'raider:2',
      attackerShipKey: null,
      victimUserid: 'raider',
      attackerUserid: null,
      attackerChannel: -1,
      weapon: 'ion',
      sector: { x: 1, y: 1 },
      tickAt: new Date(),
      loot: [],
      scoreAwarded: 0,
    };
    gateway.handleCombatShipDestroyed(event);

    expect(serverEmitMock.mock.calls[0][1]).toMatchObject({
      weapon: 'ion',
      attackerName: 'Aurelia-Landing',
    });
  });

  it('does not carry a stale planet name onto the next ship that dies', () => {
    gateway.handlePlanetIonFired({
      shipId: 'raider:2', plnum: 1, planetName: 'Aurelia-Landing',
      hullDamage: 40, shieldKnock: 0, shieldsUp: false,
    });

    const base: CombatShipDestroyedEvent = {
      victimId: 'raider:2', attackerId: null, victimShipKey: 'raider:2',
      attackerShipKey: null, victimUserid: 'raider', attackerUserid: null,
      attackerChannel: -1, weapon: 'ion', sector: { x: 1, y: 1 },
      tickAt: new Date(), loot: [], scoreAwarded: 0,
    };
    gateway.handleCombatShipDestroyed(base);
    // Same ship key dying again (respawned hull) with no fresh ion hit must
    // not inherit the previous kill's planet.
    gateway.handleCombatShipDestroyed(base);

    expect(serverEmitMock.mock.calls[1][1]).toMatchObject({ attackerName: null });
  });

  /**
   * The near-miss this fix had to avoid. `attackerChannel === -1` looks like
   * C's ion sentinel, but this port also uses -1 for NO_CHANNEL, and
   * ShipStateService resets a victim's `lastfired` to it when the recorded
   * firer leaves the game. Inferring "a planet did this" from the channel
   * alone would blame a colony every time a killer disconnected.
   */
  it('does not blame a planet when the attacker merely disconnected', () => {
    const event: CombatShipDestroyedEvent = {
      victimId: 'drifter:1',
      attackerId: null,
      victimShipKey: 'drifter:1',
      attackerShipKey: null,
      victimUserid: 'drifter',
      attackerUserid: null,
      // Reset to NO_CHANNEL because the firer left — no ion hit ever recorded.
      attackerChannel: -1,
      weapon: null,
      sector: { x: 4, y: 4 },
      tickAt: new Date(),
      loot: [],
      scoreAwarded: 0,
    };
    gateway.handleCombatShipDestroyed(event);

    expect(serverEmitMock.mock.calls[0][1]).toMatchObject({
      weapon: null,
      attackerName: null,
    });
  });

  /**
   * A ship kill must name the ship that made it.
   *
   * `attackerName` was only ever filled for a PLANET kill, so an ordinary
   * ship-vs-ship death shipped `attackerId` with no name and `weapon: null`.
   * The client resolves a name from its own player list, which holds live
   * PLAYERS only — an AI killer is not in it — so a Cybertron kill rendered as
   * a bare id or nothing at all. Two playtest pilots were killed repeatedly
   * and saw no combat text whatsoever; one reconstructed his own death from
   * `rep sys` showing shields fall 100% -> 30% -> destroyed.
   *
   * The hit path already resolves names this way (COMBAT_HIT carries
   * attackerName/victimName); the kill path did not.
   */
  it('names the ship that made a kill, including an AI one', () => {
    const gw = gateway as unknown as {
      shipStateService: { get: jest.Mock };
    };
    gw.shipStateService.get = jest.fn().mockReturnValue({ shipname: 'Cybrg-49326' });

    const event: CombatShipDestroyedEvent = {
      victimId: 'usr_tarq:1',
      attackerId: 'Cybrg-49326:222',
      victimShipKey: 'usr_tarq:1',
      attackerShipKey: 'Cybrg-49326:222',
      victimUserid: 'usr_tarq',
      attackerUserid: 'Cybrg-49326',
      attackerChannel: 222,
      weapon: null,
      sector: { x: 0, y: -1 },
      tickAt: new Date(),
      loot: [],
      scoreAwarded: 0,
    };
    gateway.handleCombatShipDestroyed(event);

    expect(serverEmitMock.mock.calls[0][1]).toMatchObject({
      attackerName: 'Cybrg-49326',
    });
  });
});
