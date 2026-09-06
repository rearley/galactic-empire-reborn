/**
 * Hyperspace narration uses CANON's words, and the sector is told.
 *
 *   if (shieldstat == SHIELDUP) { prfmsg(HYSHDN); shieldstat = SHIELDDN; }
 *   if (cloak > 0)              { prfmsg(HYCLDN); cloak = 0; }
 *   prfmsg(HYPERIN);   outprfge(FILTER,usrn);        // to the pilot
 *   ptr->where = 1;
 *   prfmsg(HYPERIN2,ptr->shipname);
 *   outsect(FILTER,&coord,usrn,0);                   // to the SECTOR
 *   -- GEFUNCS.C:588-606
 *
 * The port paraphrased all four pilot-facing messages and omitted HYPERIN2
 * entirely, so nobody watching ever saw a ship jump out. That last one matters
 * in a fight: leaving was silent.
 *
 * @see docs/DECISIONS.md 2026-09-06
 */

import { CANON_MESSAGES } from '../../src/game/commands/canon-messages.generated';

type Emit = { rooms: string[]; event: string; payload: unknown };

function build() {
  const emits: Emit[] = [];
  const server = {
    to(room: string) {
      const rooms = [room];
      const chain = {
        emit(event: string, payload: unknown) { emits.push({ rooms, event, payload }); return true; },
        except() { return chain; },
        to(next: string) { rooms.push(next); return chain; },
      };
      return chain;
    },
    emit(event: string, payload: unknown) { emits.push({ rooms: [], event, payload }); return true; },
  };
  return { server, emits };
}

const textsFor = (emits: Emit[], room: string) => emits
  .filter((e) => e.rooms.includes(room))
  .map((e) => String((e.payload as { text?: string }).text ?? ''));

describe('hyperspace narration (GEFUNCS.C:588-606)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GameGateway } = require('../../src/gateway/game.gateway');

  function gateway() {
    const { server, emits } = build();
    const gw = Object.create(GameGateway.prototype) as {
      server: unknown;
      handlePhysicsHyperspace: (e: unknown) => void;
    };
    gw.server = server;
    return { gw, emits };
  }

  it('uses canon HYSHDN, HYCLDN and HYPERIN on entry', () => {
    const { gw, emits } = gateway();

    gw.handlePhysicsHyperspace({
      shipId: 'u1:1', direction: 'enter',
      shieldsDropped: true, cloakDropped: true,
      shipname: 'WildCat', sector: { x: 3, y: 4 },
    });

    const mine = textsFor(emits, 'user:u1').join('\n');
    expect(mine).toContain(CANON_MESSAGES.HYSHDN.replace('***\n', ''));
    expect(mine).toContain(CANON_MESSAGES.HYCLDN.replace('***\n', ''));
    expect(mine).toContain(CANON_MESSAGES.HYPERIN.replace('***\n', ''));
  });

  it('uses canon HYPEROUT on exit', () => {
    const { gw, emits } = gateway();

    gw.handlePhysicsHyperspace({
      shipId: 'u1:1', direction: 'exit',
      shieldsDropped: false, cloakDropped: false,
      shipname: 'WildCat', sector: { x: 3, y: 4 },
    });

    expect(textsFor(emits, 'user:u1').join('\n'))
      .toContain(CANON_MESSAGES.HYPEROUT.replace('***\n', ''));
  });

  it('tells the SECTOR that the ship jumped (HYPERIN2)', () => {
    const { gw, emits } = gateway();

    gw.handlePhysicsHyperspace({
      shipId: 'u1:1', direction: 'enter',
      shieldsDropped: false, cloakDropped: false,
      shipname: 'WildCat', sector: { x: 3, y: 4 },
    });

    const sector = textsFor(emits, 'sector:3:4').join('\n');
    expect(sector).toContain('WildCat');
    expect(sector).toMatch(/Hyper Space/i);
  });

  it('says nothing about shields or cloak that were already down', () => {
    const { gw, emits } = gateway();

    gw.handlePhysicsHyperspace({
      shipId: 'u1:1', direction: 'enter',
      shieldsDropped: false, cloakDropped: false,
      shipname: 'WildCat', sector: { x: 3, y: 4 },
    });

    const mine = textsFor(emits, 'user:u1').join('\n');
    expect(mine).not.toMatch(/Shields shut down/);
    expect(mine).not.toMatch(/Cloaking off/);
  });
});
