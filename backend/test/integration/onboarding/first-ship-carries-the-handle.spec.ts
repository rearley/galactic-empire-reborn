/**
 * A brand-new player's FIRST ship must know its captain's handle.
 *
 * `displayName()` falls back to `userid` when `ShipState.username` is unset,
 * and our userid is a synthetic account key. Three paths put a ship into the
 * live map — boot hydration, boarding, and this one — and only this one did
 * not hydrate the profile. The result reached production on 2026-09-15: the
 * first player to arrive from the Discord had the galaxy announce
 * `Commanded by: usr_9d4ddc16bfb77c21e5b1afcd`, and it self-healed on their
 * next connection, which is why nobody who was already playing ever saw it.
 *
 * @see src/game/ship/display-name.ts  @see GEFUNCS.C:2596 username()
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { OnboardingService } from '../../../src/game/onboarding/onboarding.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { displayName } from '../../../src/game/ship/display-name';
import { START_CLASS, START_FLUX_PODS } from '../../../src/game/constants/onboarding';
import { ENGYMAX } from '../../../src/game/constants';

const USERID = 'usr_synthetic_account_key';
const HANDLE = 'Ripley';
const SHIPNAME = 'Colonial One';

describe('the first ship carries its captain’s handle', () => {
  let service: OnboardingService;
  let shipStateServiceMock: { loadShip: Mock };

  beforeEach(async () => {
    const createdShip = {
      userid: USERID, shipno: 1, shipname: SHIPNAME, shpclass: START_CLASS,
      xcoord: 0, ycoord: 0, energy: ENGYMAX, phasr: 100, shield: 0,
      heading: 0, head2b: 0, speed: 0, speed2b: 0, damage: 0, kills: 0,
      lastfired: 0, shieldtype: 0, shieldstat: 0, cloak: 0, degrees: 0,
      percent: 0, tactical: 0, helm: 0, train: 0, where: 0,
      ltorpsChannel: [], ltorpsDistance: [], lmisslChannel: [], lmisslDistance: [],
      lmisslEnergy: [], decout: [], jammer: 0, freq: [0, 0, 0],
      items: [0n, 0n, 0n, 0n, BigInt(START_FLUX_PODS), 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0, firecntl: 0,
      destruct: 0, status: 0, cybmine: 0, cybskill: 0, cybupdate: 0, tick: 0,
      emulate: 0, minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    };

    const prismaMock = {
      sector: { findUnique: vi.fn().mockResolvedValue({ xsect: 0, ysect: 0, type: 'NEUTRAL', id: 's-0-0' }) },
      planet: { findMany: vi.fn().mockResolvedValue([]) },
      shipClass: {
        findUnique: vi.fn().mockResolvedValue({ classNumber: 1, typeName: 'Interceptor', maxWarp: 10, maxTons: 1000 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ classNumber: 1, typeName: 'Interceptor', maxWarp: 10, maxTons: 1000 }),
      },
      ship: { create: vi.fn().mockResolvedValue(createdShip) },
      user: {
        // Serves BOTH reads finalize makes: the topshipno lookup and the
        // session profile. A real row carries all of these columns.
        findUnique: vi.fn().mockResolvedValue({
          topshipno: 0, username: HANDLE, teamcode: null, options: [], kills: 7, fkeys: [],
        }),
        update: vi.fn().mockResolvedValue({ userid: USERID }),
      },
    } as unknown as PrismaService;

    shipStateServiceMock = { loadShip: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ShipStateService, useValue: shipStateServiceMock },
        { provide: ConfigService, useValue: { get: vi.fn((_k: string, d: number) => d) } },
      ],
    }).compile();
    service = module.get(OnboardingService);
  });

  it('names the captain, not the account key', async () => {
    const state = await service.finalize(USERID, SHIPNAME);
    expect(state.username).toBe(HANDLE);
    expect(displayName(state)).toBe(HANDLE);
    expect(displayName(state)).not.toContain('usr_');
  });

  it('loads that same state into the live map', async () => {
    // Returning a hydrated object is not enough — what the galaxy reads is
    // whatever went into the map.
    await service.finalize(USERID, SHIPNAME);
    const loaded = shipStateServiceMock.loadShip.mock.calls[0][0];
    expect(loaded.username).toBe(HANDLE);
  });

  it('carries the captain’s cumulative kills onto the new hull', async () => {
    // Same hydration gap, different field: Cybertron escalation reads
    // userKills, so a veteran rebuilding a fleet would face rookie Cybertrons.
    const state = await service.finalize(USERID, SHIPNAME);
    expect(state.userKills).toBe(7);
  });
});
