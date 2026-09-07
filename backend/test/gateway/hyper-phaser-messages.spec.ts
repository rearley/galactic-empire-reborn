/**
 * The hyper-phaser announces itself, and says which weapon hit you.
 *
 *   prfmsg(HPFIRED,deg);            outprfge(FILTER,usrn);   // firer, on firing
 *   prfmsg(HPHITM,gechrbuf,username(wptr)); outprfge(ALWAYS,usrn);  // firer, on hit
 *   prfmsg(HPHITU,username(ptr),gechrbuf);  outprfge(ALWAYS,othusn); // VICTIM
 *
 * @see GECMDS.C:1037 (HPFIRED), :1074 (HPHITM), :1076 (HPHITU)
 *
 * All three existed in the generated string table and were emitted nowhere. The
 * port tagged a hyper hit as `weapon: 'phaser'`, so the victim was routed
 * through hitText's default branch and told "Phaser hit from Commander X's
 * ship" — the WRONG WEAPON. A pilot at warp could not tell a hyper-phaser from
 * an ordinary one, which matters because only one of them can reach them there.
 *
 * That is the same defect hitText's own comment says it was written to fix for
 * mines and torpedoes; the hyper case was missed.
 *
 * Damage is a damstr WORD in both directions, as canon reports damage
 * everywhere else.
 */
import { GameGateway } from '../../src/gateway/game.gateway';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { damstr } from '../../src/game/combat/combat-math';
import { CombatHitEvent } from '../../src/game/combat/combat-events';
import { PresenceService } from '../../src/public/presence.service';

interface Emit { rooms: string[]; event: string; payload: unknown }

function build() {
  const emits: Emit[] = [];
  const gateway = new GameGateway(
    {} as never,                                   // shipStateService
    {} as never,                                   // commandRouter
    { getSocketId: () => undefined } as never,     // registry
    {} as never,                                   // wsAuthGuard
    {} as never,                                   // prisma
    {} as never,                                   // onboardingService
    { lettersFor: () => [] } as never,             // scanHandler — hitText needs it
    {} as never,                                   // shipClassCache
    {} as never,                                   // random
    { emit: jest.fn(), on: jest.fn() } as never,   // events
    new PresenceService(),
  );
  const chain = (rooms: string[]) => ({
    to: (r: string) => chain([...rooms, r]),
    emit: (event: string, payload: unknown) => { emits.push({ rooms, event, payload }); },
  });
  (gateway as unknown as { server: unknown }).server = { to: (r: string) => chain([r]) };
  return { gateway, emits };
}

describe('hyper-phaser hit narration (GECMDS.C:1074-1076)', () => {
  it('tells the victim it was a HYPER-phaser, not an ordinary one', () => {
    const { gateway, emits } = build();
    const event: CombatHitEvent = {
      attackerId: 'usr_a:1',
      victimId: 'usr_b:1',
      weapon: 'hyper-phaser',
      damageHull: 30,
      damageShield: 0,
      sector: { x: 4, y: 4 },
      tickAt: new Date('2026-09-06T12:00:00Z'),
    } as CombatHitEvent;

    (gateway as unknown as { handleCombatHit: (e: CombatHitEvent) => void }).handleCombatHit(event);

    const victimLine = emits
      .filter((e) => e.rooms.includes('user:usr_b'))
      .map((e) => String((e.payload as { text?: string }).text ?? ''))
      .join(' ');
    expect(victimLine).toContain('Hyper-Phaser');
  });

  it('reports the damage as a word', () => {
    const { gateway, emits } = build();
    (gateway as unknown as { handleCombatHit: (e: CombatHitEvent) => void }).handleCombatHit({
      attackerId: 'usr_a:1', victimId: 'usr_b:1', weapon: 'hyper-phaser',
      damageHull: 30, damageShield: 0, sector: { x: 4, y: 4 },
      tickAt: new Date('2026-09-06T12:00:00Z'),
    } as CombatHitEvent);

    const victimLine = emits
      .filter((e) => e.rooms.includes('user:usr_b'))
      .map((e) => String((e.payload as { text?: string }).text ?? ''))
      .join(' ');
    expect(victimLine).toContain(damstr(30));
  });

  it('an ordinary phaser hit still reads as a phaser', () => {
    const { gateway, emits } = build();
    (gateway as unknown as { handleCombatHit: (e: CombatHitEvent) => void }).handleCombatHit({
      attackerId: 'usr_a:1', victimId: 'usr_b:1', weapon: 'phaser',
      damageHull: 30, damageShield: 0, sector: { x: 4, y: 4 },
      tickAt: new Date('2026-09-06T12:00:00Z'),
    } as CombatHitEvent);

    const victimLine = emits
      .filter((e) => e.rooms.includes('user:usr_b'))
      .map((e) => String((e.payload as { text?: string }).text ?? ''))
      .join(' ');
    expect(victimLine).not.toContain('Hyper-Phaser');
  });
});
