import { DatHandlerService } from '../../../src/game/commands/handlers/dat.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { TeamRepository } from '../../../src/game/team/team.repository';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { CommandContext, CommandResult } from '../../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../../helpers/make-ship';

/**
 * `dat` reports YOUR OWN ship. It never reported anyone else's.
 *
 * Canon's cmd_data (GECMDS.C:5829) is a machine-readable dump for a front-end
 * terminal program: gated behind `dat qazwsx <report|scan|sector>` — anything
 * else returns INVCMD — and every field it prints comes from `warsptr` and
 * `waruptr`, the CALLER's ship and the CALLER's user record. It has no target
 * argument and touches no other ship.
 *
 * The port recast it as `dat <fragment>`, "a player-facing scouting verb"
 * (spec 012 D1), which returned for any ship in the galaxy, at unlimited range,
 * silently, with no notice to the target: exact sector, heading, speed, energy,
 * damage, kills AND the full cargo manifest including gold. Canon has no way to
 * learn another ship's cargo at all — `spy` is planet-only, orbit-only, and
 * consumes an I_SPY item (GECMDS.C cmd_spy). It also matched on `!s.cloak`
 * rather than `cloak < 10`, so a ship spinning up its cloak was still exposed,
 * and it did not exclude AI, so every Cybertron's hold was public too.
 *
 * Reported from play: "not sure I like the command dat <fragment> as that gives
 * full info on another players ship". What a pilot may learn about someone
 * else's ship is what `sca sh` shows — range-gated, and it announces itself.
 */
function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    heading: 45,
    speed: 5,
    xcoord: 5,
    ycoord: 3,
    damage: 10,
    energy: 800,
    kills: 3,
    items: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n, 13n, 14n],
    ...overrides,
  });
}

function makeHandler(ships: ShipState[], teamname?: string): DatHandlerService {
  const shipSvc = { findAllShips: () => ships } as unknown as ShipStateService;
  const teamsMock = {
    findNameByCode: vi.fn().mockResolvedValue(teamname ? { teamname } : null),
  } as unknown as TeamRepository;
  return new DatHandlerService(shipSvc, teamsMock);
}

const ctx: CommandContext = {};
const run = async (h: DatHandlerService, ship: ShipState, args: string[] = []) =>
  ((await h.command.handler(ship, args, ctx)) as CommandResult).lines.map((l) => l.text).join('\n');

describe('DatHandlerService — command metadata', () => {
  it('keyword is "dat"', () => {
    expect(makeHandler([]).command.keyword).toBe('dat');
  });

  it('takes no arguments — canon’s dat has no target', () => {
    expect(makeHandler([]).command.minArgs).toBe(0);
  });
});

describe('`dat` reports the caller’s own ship', () => {
  it('names the ship you are flying', async () => {
    const me = makeShip({ shipname: 'WildCat' });
    expect(await run(makeHandler([me]), me)).toContain('WildCat');
  });

  it('gives your own position, heading and speed', async () => {
    const me = makeShip();
    const out = await run(makeHandler([me]), me);
    expect(out).toContain('(5,3)');
    expect(out).toMatch(/Heading:\s*45/);
  });

  it('gives your own cargo, gold included', async () => {
    const me = makeShip();
    const out = await run(makeHandler([me]), me);
    expect(out).toMatch(/Gold:\s*13/);
  });

  it('names your team when you have one', async () => {
    const me = makeShip({ teamcode: 4n });
    expect(await run(makeHandler([me], 'Red Fleet'), me)).toContain('Red Fleet');
  });
});

describe('`dat` cannot be pointed at anyone else', () => {
  const me = () => makeShip({ userid: 'u1', shipno: 1, shipname: 'Alpha' });
  const them = () => makeShip({
    userid: 'u2', shipno: 1, shipname: 'StarFighter', xcoord: 40, ycoord: -12,
    items: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 999n, 0n],
  });

  it('refuses a ship-name argument instead of scouting with it', async () => {
    const out = await run(makeHandler([me(), them()]), me(), ['star']);
    expect(out).not.toContain('StarFighter');
    expect(out).not.toContain('999');
  });

  it('points the pilot at the command that CAN look at another ship', async () => {
    const out = await run(makeHandler([me(), them()]), me(), ['star']);
    expect(out).toMatch(/sca sh/);
  });

  it('never discloses another ship’s cargo, however it is called', async () => {
    const handler = makeHandler([me(), them()]);
    for (const args of [[], ['star'], ['StarFighter'], ['u2'], ['']]) {
      const out = await run(handler, me(), args);
      expect(out).not.toContain('999');
      expect(out).not.toContain('StarFighter');
    }
  });

  it('does not leak an AI ship’s hold either', async () => {
    const cyb = makeShip({
      userid: 'Cybrg-9', shipno: 1, shipname: 'Cybertron 42473', status: 2,
      items: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 471n, 0n],
    });
    const out = await run(makeHandler([me(), cyb]), me(), ['cyber']);
    expect(out).not.toContain('471');
    expect(out).not.toContain('Cybertron 42473');
  });
});
