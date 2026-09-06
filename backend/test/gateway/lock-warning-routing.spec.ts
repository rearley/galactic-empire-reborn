/**
 * The lock warnings go to the TARGET, and only to the target.
 *
 * Canon: `prfmsg(LOCK2,shpltr(ship,usrn)); outprfge(FILTER,ship);` — addressed
 * to `ship`, the ship being locked, not to the sector and not to the firer.
 * @see GECMDS.C:1401 (LOCK2, good lock) and :1415 (LOCK4, failed lock)
 *
 * `%c` is the FIRER's scan letter as the TARGET sees it, which is what lets the
 * victim match the warning to a contact on their own scan — so the letter must
 * survive the trip to the client.
 */
import { GameGateway } from '../../src/gateway/game.gateway';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { CombatTargetWarningEvent } from '../../src/game/combat/combat-events';

interface Emit { rooms: string[]; event: string; payload: unknown }

function build() {
  const emits: Emit[] = [];
  const gateway = new GameGateway(
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    { emit: jest.fn(), on: jest.fn() } as never,
  );
  const chain = (rooms: string[]) => ({
    to: (r: string) => chain([...rooms, r]),
    emit: (event: string, payload: unknown) => { emits.push({ rooms, event, payload }); },
  });
  (gateway as unknown as { server: unknown }).server = { to: (r: string) => chain([r]) };
  return { gateway, emits };
}

function fire(gateway: GameGateway, event: CombatTargetWarningEvent) {
  (gateway as unknown as {
    handleCombatTargetWarning: (e: CombatTargetWarningEvent) => void;
  }).handleCombatTargetWarning(event);
}

describe('lock warnings are addressed to the target (GECMDS.C:1401, :1415)', () => {
  it('sends LOCK2 to the locked ship, and to nobody else', () => {
    const { gateway, emits } = build();

    fire(gateway, {
      victimId: 'usr_victim:1',
      kind: 'lock-acquired',
      attackerLetter: 'C',
      tickAt: new Date('2026-09-06T12:00:00Z'),
    });

    expect(emits).toHaveLength(1);
    expect(emits[0].rooms).toEqual(['user:usr_victim']);
    expect(emits[0].payload).toEqual({
      category: 'combat',
      text: formatMessage(MessageId.LOCK_WARN_ACQUIRED, 'C'),
    });
  });

  it('sends LOCK4 on a failed lock, which is how a stalker gives themselves away', () => {
    const { gateway, emits } = build();

    fire(gateway, {
      victimId: 'usr_victim:1',
      kind: 'lock-attempt',
      attackerLetter: 'B',
      tickAt: new Date('2026-09-06T12:00:00Z'),
    });

    expect(emits).toHaveLength(1);
    expect(emits[0].payload).toEqual({
      category: 'combat',
      text: formatMessage(MessageId.LOCK_WARN_ATTEMPT, 'B'),
    });
  });

  it('carries the attacker letter through to the text', () => {
    const { gateway, emits } = build();

    fire(gateway, {
      victimId: 'usr_victim:1',
      kind: 'lock-acquired',
      attackerLetter: 'F',
      tickAt: new Date('2026-09-06T12:00:00Z'),
    });

    // Canon's LOCK2 is "...Ship %c has a fire control scanner locked on us!"
    expect(String((emits[0].payload as { text: string }).text)).toContain('F');
  });
});
