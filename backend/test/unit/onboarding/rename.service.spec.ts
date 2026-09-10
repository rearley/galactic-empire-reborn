import { RenameService } from '../../../src/game/onboarding/rename.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'OldName',
    shpclass: 1, heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 1, ycoord: 1, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makePrisma(findFirstResult: object | null = null) {
  return {
    ship: {
      findFirst: jest.fn().mockResolvedValue(findFirstResult),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function makeShipStateService(ship: ShipState | undefined) {
  return {
    get: jest.fn().mockReturnValue(ship),
    mutate: jest.fn().mockImplementation(
      (_userid: string, _shipno: number, fn: (s: ShipState) => void) => {
        if (ship) fn(ship);
        return ship;
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// T053 — RenameService unit tests
// ---------------------------------------------------------------------------
describe('RenameService (T053)', () => {
  describe('INVALID_FORMAT — name fails isValidShipName', () => {
    it('rejects empty string', async () => {
      const prisma = makePrisma();
      const shipStateService = makeShipStateService(makeShip());
      const svc = new RenameService(prisma as never, shipStateService as never);

      const result = await svc.rename('u1', 1, '');
      expect(result).toEqual({ ok: false, reason: 'INVALID_FORMAT' });
      expect(prisma.ship.findFirst).not.toHaveBeenCalled();
      expect(prisma.ship.update).not.toHaveBeenCalled();
    });

    it('rejects a name padded with spaces, which no caller should send', async () => {
      const prisma = makePrisma();
      const svc = new RenameService(prisma as never, makeShipStateService(makeShip()) as never);

      const result = await svc.rename('u1', 1, ' Star Falcon ');
      expect(result).toEqual({ ok: false, reason: 'INVALID_FORMAT' });
    });

    /**
     * Canon runs `rstrin()` before `strncpy(shipname, margv[1], 19)`, which
     * restores the split input line, so the name is everything to the end of
     * it (GECMDS.C:5004-5006). Interior spaces were always legal; the port
     * invented the restriction and `ren BigCat II` produced "BigCat".
     */
    it('accepts an interior space', async () => {
      const prisma = makePrisma();
      const svc = new RenameService(prisma as never, makeShipStateService(makeShip()) as never);

      const result = await svc.rename('u1', 1, 'BigCat II');
      expect(result.ok).toBe(true);
    });

    it('rejects name longer than 19 characters', async () => {
      const prisma = makePrisma();
      const svc = new RenameService(prisma as never, makeShipStateService(makeShip()) as never);

      const result = await svc.rename('u1', 1, 'A'.repeat(20));
      expect(result).toEqual({ ok: false, reason: 'INVALID_FORMAT' });
    });
  });

  describe('SHIP_NOT_FOUND — ship not in memory', () => {
    it('returns SHIP_NOT_FOUND when get() returns undefined', async () => {
      const prisma = makePrisma();
      const svc = new RenameService(prisma as never, makeShipStateService(undefined) as never);

      const result = await svc.rename('u1', 1, 'NewName');
      expect(result).toEqual({ ok: false, reason: 'SHIP_NOT_FOUND' });
      expect(prisma.ship.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('Byte-identical rename (no-op)', () => {
    it('returns ok:true with oldName === newName without any DB call', async () => {
      const ship = makeShip({ shipname: 'SameName' });
      const prisma = makePrisma();
      const shipStateService = makeShipStateService(ship);
      const svc = new RenameService(prisma as never, shipStateService as never);

      const result = await svc.rename('u1', 1, 'SameName');
      expect(result).toEqual({
        ok: true,
        oldName: 'SameName',
        newName: 'SameName',
        shipId: 'u1:1',
      });
      expect(prisma.ship.findFirst).not.toHaveBeenCalled();
      expect(prisma.ship.update).not.toHaveBeenCalled();
      expect(shipStateService.mutate).not.toHaveBeenCalled();
    });
  });

  describe('NAME_TAKEN — conflict with another ship', () => {
    it('returns NAME_TAKEN when findFirst returns a conflicting ship', async () => {
      const ship = makeShip({ shipname: 'OldName' });
      const prisma = makePrisma({ userid: 'u2', shipno: 1, shipname: 'NewName' });
      const svc = new RenameService(prisma as never, makeShipStateService(ship) as never);

      const result = await svc.rename('u1', 1, 'NewName');
      expect(result).toEqual({ ok: false, reason: 'NAME_TAKEN' });
      expect(prisma.ship.update).not.toHaveBeenCalled();
    });

    it('queries DB with case-insensitive mode and excludes own ship', async () => {
      const ship = makeShip({ shipname: 'OldName' });
      const prisma = makePrisma(null); // no conflict
      const svc = new RenameService(prisma as never, makeShipStateService(ship) as never);

      await svc.rename('u1', 1, 'NewName');

      expect(prisma.ship.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shipname: { equals: 'NewName', mode: 'insensitive' },
            NOT: { AND: [{ userid: 'u1' }, { shipno: 1 }] },
          }),
        }),
      );
    });

    it('escapes ILIKE wildcards in the requested name — isValidShipName allows % and _', async () => {
      // "%"/"_" are printable ASCII in 0x21-0x7E, so isValidShipName accepts
      // them, but `mode: 'insensitive'` renders as `shipname ILIKE $1` with
      // the value used verbatim as the pattern: an unescaped "%" would match
      // (and falsely block a rename against) any existing ship name.
      const ship = makeShip({ shipname: 'OldName' });
      const prisma = makePrisma(null);
      const svc = new RenameService(prisma as never, makeShipStateService(ship) as never);

      await svc.rename('u1', 1, 'a%b_c');

      expect(prisma.ship.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shipname: { equals: 'a\\%b\\_c', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  describe('Successful rename', () => {
    it('happy path — updates DB and mutates memory, returns ok:true', async () => {
      const ship = makeShip({ shipname: 'OldName' });
      const prisma = makePrisma(null);
      const shipStateService = makeShipStateService(ship);
      const svc = new RenameService(prisma as never, shipStateService as never);

      const result = await svc.rename('u1', 1, 'NewName');

      expect(result).toEqual({
        ok: true,
        oldName: 'OldName',
        newName: 'NewName',
        shipId: 'u1:1',
      });
      expect(prisma.ship.update).toHaveBeenCalledWith({
        where: { userid_shipno: { userid: 'u1', shipno: 1 } },
        data: { shipname: 'NewName' },
      });
      expect(shipStateService.mutate).toHaveBeenCalledWith('u1', 1, expect.any(Function));
    });

    it('casing-only change is not treated as a no-op — DB is updated', async () => {
      const ship = makeShip({ shipname: 'falcon' });
      const prisma = makePrisma(null);
      const shipStateService = makeShipStateService(ship);
      const svc = new RenameService(prisma as never, shipStateService as never);

      const result = await svc.rename('u1', 1, 'Falcon');

      expect(result).toEqual({
        ok: true,
        oldName: 'falcon',
        newName: 'Falcon',
        shipId: 'u1:1',
      });
      expect(prisma.ship.update).toHaveBeenCalled();
      expect(shipStateService.mutate).toHaveBeenCalled();
    });

    it('mutate callback sets shipname on the state object', async () => {
      const ship = makeShip({ shipname: 'OldName' });
      const prisma = makePrisma(null);
      // Use real mutate behaviour to verify shipname is updated
      const shipStateService = {
        get: jest.fn().mockReturnValue(ship),
        mutate: jest.fn().mockImplementation(
          (_u: string, _n: number, fn: (s: ShipState) => void) => {
            fn(ship);
            return ship;
          },
        ),
      };
      const svc = new RenameService(prisma as never, shipStateService as never);

      await svc.rename('u1', 1, 'BrandNew');
      expect(ship.shipname).toBe('BrandNew');
    });
  });
});
