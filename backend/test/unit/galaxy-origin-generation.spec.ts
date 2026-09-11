import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { S00, S00_PLNUM } from '../../src/game/galaxy/s00';
import { Rng } from '../../src/game/galaxy/rng';
import { NEUTRAL_ZONE_OWNER } from '../../src/game/combat/neutral-zone';

/**
 * The origin sector must be built by dispatching on each fixture entry's
 * `type`, exactly as GEPLANET.C:497-528 does:
 *
 *   type 1 -> build_plan_1  (Zygor, the weapons hub)          -> Planet row
 *   type 2 -> build_plan_2  (Tahanian Station, troops/men/food) -> Planet row
 *   type 3 -> build_worm    (a portal)                        -> Wormhole row
 *   else   -> build_other   (Enforcer Planet, no stock)       -> Planet row
 *
 * The port dispatched on ARRAY INDEX instead (index 0 -> plan_1, index 1 ->
 * plan_2, everything else bare) and had no wormhole branch at all, so the
 * three shipped neutral-zone portals -- Kayriez, Lydorian, Tryklon -- did not
 * exist in the generated galaxy.
 */

interface Row { [k: string]: unknown }

function makeTx() {
  const sectors: Row[] = [];
  const planets: Row[] = [];
  const wormholes: Row[] = [];
  return {
    rows: { sectors, planets, wormholes },
    tx: {
      sector: { create: vi.fn(async ({ data }: { data: Row }) => { sectors.push(data); }) },
      planet: { create: vi.fn(async ({ data }: { data: Row }) => { planets.push(data); }) },
      wormhole: { create: vi.fn(async ({ data }: { data: Row }) => { wormholes.push(data); }) },
    },
  };
}

async function generate() {
  const { tx, rows } = makeTx();
  const svc = Object.create(GalaxyService.prototype) as GalaxyService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc as any).generateOrigin(tx, new Rng(12345));
  return rows;
}

describe('origin sector generation dispatches on s00 type', () => {
  it('writes one sector row declaring all S00_PLNUM slots', async () => {
    const rows = await generate();
    expect(rows.sectors).toHaveLength(1);
    expect(rows.sectors[0]).toMatchObject({ xsect: 0, ysect: 0, numplan: S00_PLNUM });
  });

  it('writes a Planet for every non-portal entry and a Wormhole for every portal', async () => {
    const rows = await generate();
    const portals = S00.filter((e) => e.type === 3);
    expect(portals).toHaveLength(3);
    expect(rows.wormholes).toHaveLength(portals.length);
    expect(rows.planets).toHaveLength(S00_PLNUM - portals.length);
  });

  it('every row keeps its fixture plnum, name and coordinates', async () => {
    const rows = await generate();
    const byPlnum = new Map<number, Row>();
    for (const r of [...rows.planets, ...rows.wormholes]) byPlnum.set(r.plnum as number, r);
    S00.forEach((e, i) => {
      const r = byPlnum.get(i + 1);
      expect(r).toBeDefined();
      expect(r!.name).toBe(e.name);
      expect(r!.xcoord).toBe(e.xcoord);
      expect(r!.ycoord).toBe(e.ycoord);
    });
  });

  it('portals are visible and point somewhere other than the origin', async () => {
    const rows = await generate();
    for (const w of rows.wormholes) {
      // build_worm sets worm.visible = 1 — GEPLANET.C:822
      expect(w.visible).toBe(1);
      expect([w.destXcoord, w.destYcoord]).not.toEqual([0.5, 0.5]);
    }
  });

  it('Zygor (type 1) stocks every item; Tahanian Station (type 2) stocks three', async () => {
    const rows = await generate();
    const zygor = rows.planets.find((p) => p.plnum === 1)!;
    const tahanian = rows.planets.find((p) => p.plnum === 2)!;
    expect(S00[0].type).toBe(1);
    expect(S00[1].type).toBe(2);
    const zSell = zygor.itemsSell as number[];
    const tSell = tahanian.itemsSell as number[];
    expect(zSell.every((v) => v === 1)).toBe(true);
    // I_MEN=0, I_FOOD=5, I_TROOPS=8 — GEPLANET.C:740-752
    expect(tSell.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([0, 5, 8]);
  });

  it('the Enforcer Planet (type 0) is built bare — build_other sets no items', async () => {
    const rows = await generate();
    expect(S00[2].type).toBe(0);
    const enforcer = rows.planets.find((p) => p.plnum === 3)!;
    expect(enforcer.name).toBe('Enforcer Planet');
    expect((enforcer.itemsQty as bigint[]).every((q) => q === 0n)).toBe(true);
    expect((enforcer.itemsSell as number[]).every((s) => s === 0)).toBe(true);
  });

  it('every planet row is owned by the neutral-zone authority', async () => {
    const rows = await generate();
    for (const p of rows.planets) expect(p.userid).toBe(NEUTRAL_ZONE_OWNER);
  });
});
