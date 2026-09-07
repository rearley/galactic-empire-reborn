/**
 * The killer is told what they salvaged and what it scored.
 *
 *   prfmsg(KILLGOT1,ptr->shipname);
 *   for (i=1;i<NUMITEMS;++i) if (i != I_MEN && i != I_TROOPS) {
 *       amt = ptr->items[i] / (gernd()%5 +1);
 *       if (amt > 0 && chkweight(wptr,i,amt)) { ... prf(", %s %s",amt,item_name[i]); }
 *   }
 *   ...
 *   prfmsg(KILLPNTS,gechrbuf,shipclass[ptr->shpclass].typename);
 *
 * @see GEFUNCS.C:1120-1136 (salvage) and :1187 (score), both in killem
 *
 * The port computed the loot and the score, carried both on
 * COMBAT_SHIP_DESTROYED, and narrated neither. A player destroyed a ship, their
 * hold silently gained cargo and their score silently moved, and the log said
 * only "X was destroyed by Y" — so there was no way to tell what a kill was
 * worth, or that looting happened at all.
 *
 * KILLGOT1 ends mid-sentence on purpose ("We have retrieved") — canon appends
 * the items with `prf(", %s %s")`, so the list is part of the same line.
 */
import { GameGateway } from '../../src/gateway/game.gateway';
import { MessageId, formatMessage } from '../../src/game/commands/messages';
import { CombatShipDestroyedEvent } from '../../src/game/combat/combat-events';
import { I_TORP, I_GOLD } from '../../src/game/constants/items';
import { PresenceService } from '../../src/public/presence.service';

interface Emit { rooms: string[]; event: string; payload: unknown }

function build() {
  const emits: Emit[] = [];
  const gateway = new GameGateway(
    {} as never, {} as never,
    { getSocketId: () => undefined } as never,
    {} as never, {} as never, {} as never,
    { lettersFor: () => [] } as never,
    { getTypeName: () => 'Interceptor' } as never,
    {} as never,
    { emit: jest.fn(), on: jest.fn() } as never, new PresenceService(),
  );
  const chain = (rooms: string[]) => ({
    to: (r: string) => chain([...rooms, r]),
    emit: (event: string, payload: unknown) => { emits.push({ rooms, event, payload }); },
  });
  (gateway as unknown as { server: unknown }).server = { to: (r: string) => chain([r]) };
  return { gateway, emits };
}

function kill(over: Partial<CombatShipDestroyedEvent> = {}): CombatShipDestroyedEvent {
  return {
    victimId: 'usr_v:1', attackerId: 'usr_k:1',
    victimShipKey: 'usr_v:1', attackerShipKey: 'usr_k:1',
    victimUserid: 'usr_v', attackerUserid: 'usr_k',
    attackerChannel: 2, weapon: 'phaser',
    victimShipname: 'Wanderer', victimClass: 1,
    sector: { x: 3, y: 3 }, tickAt: new Date('2026-09-06T12:00:00Z'),
    loot: [{ itemIndex: I_TORP, amount: 4n }, { itemIndex: I_GOLD, amount: 120n }],
    scoreAwarded: 750,
    ...over,
  } as CombatShipDestroyedEvent;
}

const report = (gateway: GameGateway, e: CombatShipDestroyedEvent) =>
  (gateway as unknown as { handleKillReport: (e: CombatShipDestroyedEvent) => void })
    .handleKillReport(e);

const killerText = (emits: Emit[]) => emits
  .filter((e) => e.rooms.includes('user:usr_k'))
  .map((e) => String((e.payload as { text?: string }).text ?? ''))
  .join('\n');

describe('kill salvage report (GEFUNCS.C:1120-1136, :1187)', () => {
  it('tells the killer what they salvaged', () => {
    const { gateway, emits } = build();

    report(gateway, kill());

    const text = killerText(emits).toLowerCase();
    expect(text).toContain('we have retrieved');
    // Case-insensitive on purpose: our ITEM_NAMES render "Torpedoes"/"Gold"
    // where canon's item_name[] is "torpedos"/"gold" (GECMDS.C:81-107). That
    // spelling difference is pre-existing and shared by every other narration
    // site in the port, so it is not this change's to fix — but the ITEMS must
    // be named, which is what this asserts.
    expect(text).toContain('torpedo');
    expect(text).toContain('gold');
    expect(text).toContain('4');
  });

  it('tells the killer what the kill scored', () => {
    const { gateway, emits } = build();

    report(gateway, kill({ scoreAwarded: 750 }));

    expect(killerText(emits)).toContain(formatMessage(MessageId.KILL_POINTS, '750', 'Interceptor').trim());
  });

  it('reports the kill even when nothing was salvageable', () => {
    const { gateway, emits } = build();

    report(gateway, kill({ loot: [] }));

    expect(killerText(emits)).toContain('We have destroyed');
  });

  /**
   * Canon closes the sentence unconditionally:
   *
   *     prfmsg(KILLGOT1,ptr->shipname);        // "...We have retrieved"
   *     for (...) prf(", %s %s",amt,name);     // ", 74 gold"
   *     prf(".\r");                            // <- always, GEFUNCS.C:1141
   *
   * The port emitted the header and the list and then simply stopped, so a
   * kill that salvaged nothing — which is the common case with a full hold —
   * read as a truncated line: "We have retrieved" with nothing after it,
   * looking for all the world like the message had been cut off mid-render.
   * Reported from play after a Cybertron Scout kill with 38 tons free.
   *
   * `toContain` in the cases above is what let it through: it can prove a
   * fragment is present but never that the sentence ENDS.
   */
  it('closes the sentence with a period when nothing fitted in the hold', () => {
    const { gateway, emits } = build();

    report(gateway, kill({ loot: [] }));

    expect(killerText(emits)).toMatch(/We have retrieved\.$/m);
  });

  it('closes the sentence with a period after the salvage list', () => {
    const { gateway, emits } = build();

    report(gateway, kill());

    expect(killerText(emits)).toMatch(/We have retrieved(, [^\n]*)\.$/m);
  });

  it('says nothing to a killer that does not exist — a self-destruct', () => {
    const { gateway, emits } = build();

    report(gateway, kill({ attackerId: null, attackerUserid: null, loot: [], scoreAwarded: 0 }));

    expect(emits).toHaveLength(0);
  });
});
