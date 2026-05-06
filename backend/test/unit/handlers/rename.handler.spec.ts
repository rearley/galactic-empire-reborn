import { RenameHandlerService } from '../../../src/game/commands/handlers/rename.handler';
import { RenameService, RenameResult } from '../../../src/game/onboarding/rename.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext } from '../../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'OldName',
    shpclass: 1, heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 3, damage: 0, energy: 1000,
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
    dirty: false,
    ...overrides,
  };
}

function makeHandler(renameResult: RenameResult): RenameHandlerService {
  const renameSvc = { rename: jest.fn().mockResolvedValue(renameResult) } as unknown as RenameService;
  return new RenameHandlerService(renameSvc);
}

const ctx: CommandContext = {};

describe('RenameHandlerService', () => {
  describe('command metadata', () => {
    it('keyword is "rename"', () => {
      const handler = makeHandler({ ok: false, reason: 'INVALID_FORMAT' });
      expect(handler.command.keyword).toBe('rename');
    });

    it('minArgs is 1', () => {
      const handler = makeHandler({ ok: false, reason: 'INVALID_FORMAT' });
      expect(handler.command.minArgs).toBe(1);
    });

    it('aliases array is empty', () => {
      const handler = makeHandler({ ok: false, reason: 'INVALID_FORMAT' });
      expect(handler.command.aliases).toEqual([]);
    });
  });

  describe('INVALID_FORMAT response', () => {
    it('returns system line with guidance text', async () => {
      const ship = makeShip();
      const handler = makeHandler({ ok: false, reason: 'INVALID_FORMAT' });
      const result = await handler.command.handler(ship, ['bad name'], ctx);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].category).toBe('system');
      expect(result.lines[0].text).toMatch(/invalid ship name/i);
    });
  });

  describe('NAME_TAKEN response', () => {
    it('returns system line mentioning the attempted name', async () => {
      const ship = makeShip();
      const handler = makeHandler({ ok: false, reason: 'NAME_TAKEN' });
      const result = await handler.command.handler(ship, ['Taken'], ctx);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].category).toBe('system');
      expect(result.lines[0].text).toContain('Taken');
      expect(result.lines[0].text).toMatch(/already taken/i);
    });
  });

  describe('byte-identical no-op', () => {
    it('returns system line with "unchanged" message and no broadcasts', async () => {
      const ship = makeShip({ shipname: 'SameName' });
      const handler = makeHandler({
        ok: true,
        oldName: 'SameName',
        newName: 'SameName',
        shipId: 'u1:1',
      });
      const result = await handler.command.handler(ship, ['SameName'], ctx);
      expect(result.lines[0].text).toMatch(/unchanged/i);
      expect(result.broadcasts).toBeUndefined();
    });
  });

  describe('successful rename', () => {
    it('returns success line with old → new names', async () => {
      const ship = makeShip({ xcoord: 5.7, ycoord: 3.2 });
      const handler = makeHandler({
        ok: true,
        oldName: 'OldName',
        newName: 'NewName',
        shipId: 'u1:1',
      });
      const result = await handler.command.handler(ship, ['NewName'], ctx);
      expect(result.lines[0].category).toBe('success');
      expect(result.lines[0].text).toContain('OldName');
      expect(result.lines[0].text).toContain('NewName');
    });

    it('includes ship.renamed broadcast for correct sector room', async () => {
      // xcoord=5.7 → floor=5, ycoord=3.2 → floor=3 → sector:5:3
      const ship = makeShip({ xcoord: 5.7, ycoord: 3.2 });
      const handler = makeHandler({
        ok: true,
        oldName: 'OldName',
        newName: 'NewName',
        shipId: 'u1:1',
      });
      const result = await handler.command.handler(ship, ['NewName'], ctx);
      expect(result.broadcasts).toBeDefined();
      const renamed = result.broadcasts!.find((b) => b.event === 'ship.renamed');
      expect(renamed).toBeDefined();
      expect(renamed!.room).toBe('sector:5:3');
      expect(renamed!.payload).toMatchObject({
        shipId: 'u1:1',
        oldName: 'OldName',
        newName: 'NewName',
      });
    });

    it('includes player.snapshot sentinel broadcast', async () => {
      const ship = makeShip();
      const handler = makeHandler({
        ok: true,
        oldName: 'OldName',
        newName: 'NewName',
        shipId: 'u1:1',
      });
      const result = await handler.command.handler(ship, ['NewName'], ctx);
      const snapshot = result.broadcasts!.find((b) => b.event === 'player.snapshot');
      expect(snapshot).toBeDefined();
      expect(snapshot!.room).toBe('__player_snapshot__');
    });

    it('passes the first arg as the new name (casing preserved)', async () => {
      const ship = makeShip();
      const renameSvc = { rename: jest.fn().mockResolvedValue({ ok: false, reason: 'SHIP_NOT_FOUND' }) } as unknown as RenameService;
      const handler = new RenameHandlerService(renameSvc);
      await handler.command.handler(ship, ['StarFalcon'], ctx);
      expect(renameSvc.rename).toHaveBeenCalledWith('u1', 1, 'StarFalcon');
    });
  });
});
