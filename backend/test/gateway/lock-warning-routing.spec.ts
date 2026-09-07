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
import { PresenceService } from '../../src/public/presence.service';

interface Emit { rooms: string[]; event: string; payload: unknown }

function build() {
  const emits: Emit[] = [];
  const gateway = new GameGateway(
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    { emit: jest.fn(), on: jest.fn() } as never, new PresenceService(),
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

describe('launch warnings reach the target (GECMDS.C:1198, :1313)', () => {
  it('renders TFIRE2 for an inbound torpedo', () => {
    const { gateway, emits } = build();

    fire(gateway, {
      victimId: 'usr_victim:1',
      kind: 'torpedo-launched',
      attackerLetter: 'D',
      tickAt: new Date('2026-09-06T12:00:00Z'),
    });

    expect(emits[0].rooms).toEqual(['user:usr_victim']);
    expect(emits[0].payload).toEqual({
      category: 'combat',
      text: formatMessage(MessageId.TORP_INBOUND, 'D'),
    });
  });

  it('renders MFIRE2 for an inbound missile, distinct from the torpedo line', () => {
    const { gateway, emits } = build();

    fire(gateway, {
      victimId: 'usr_victim:1',
      kind: 'missile-launched',
      attackerLetter: 'D',
      tickAt: new Date('2026-09-06T12:00:00Z'),
    });

    expect(emits[0].payload).toEqual({
      category: 'combat',
      text: formatMessage(MessageId.MISSILE_INBOUND, 'D'),
    });
    // A victim must be able to tell which weapon is coming — the port's
    // long-standing bug shape is one message standing in for several.
    expect(formatMessage(MessageId.MISSILE_INBOUND, 'D'))
      .not.toBe(formatMessage(MessageId.TORP_INBOUND, 'D'));
  });
});

describe('the in-flight RED ALERT reaches the target (GEFUNCS.C:1600, :1685)', () => {
  it('renders TORP1, which takes no attacker letter', () => {
    const { gateway, emits } = build();

    fire(gateway, {
      victimId: 'usr_victim:1',
      kind: 'torpedo-inbound',
      attackerLetter: '',
      tickAt: new Date('2026-09-06T12:00:00Z'),
    });

    expect(emits[0].rooms).toEqual(['user:usr_victim']);
    expect(emits[0].payload).toEqual({
      category: 'combat',
      text: formatMessage(MessageId.TORP_TRACKING),
    });
    // Canon tells you something is tracking you, not who fired it — so no
    // stray '%c' may survive into the rendered line.
    expect(String((emits[0].payload as { text: string }).text)).not.toContain('%');
  });

  it('renders MISSL1 for a missile', () => {
    const { gateway, emits } = build();

    fire(gateway, {
      victimId: 'usr_victim:1',
      kind: 'missile-inbound',
      attackerLetter: '',
      tickAt: new Date('2026-09-06T12:00:00Z'),
    });

    expect(emits[0].payload).toEqual({
      category: 'combat',
      text: formatMessage(MessageId.MISSILE_TRACKING),
    });
  });
});

/**
 * The helm's own lines go to the captain's socket, and nowhere else.
 *
 * WARP is `outprfge(FILTER, usrn)` (GEFUNCS.C:499) — the captain, filterable.
 * NOACCEL is `outprfge(ALWAYS, usrn)` (GEFUNCS.C:529) — the captain, and canon
 * will not let it be filtered away, which is why it is carried as an alert.
 */
describe('helm narration routing (GEFUNCS.C:498, :528)', () => {
  it('sends the WARP rung to the captain only', () => {
    const { gateway, emits } = build();

    (gateway as unknown as { handleWarpProgress: (e: unknown) => void }).handleWarpProgress({
      shipId: 'usr_pilot:1', userid: 'usr_pilot', shipno: 1, warp: 4,
    });

    expect(emits).toHaveLength(1);
    expect(emits[0].rooms).toEqual(['user:usr_pilot']);
    expect(emits[0].payload).toEqual({
      category: 'system',
      text: formatMessage(MessageId.HELM_WARP, 4),
    });
  });

  it('carries NOACCEL as an alert, with the raw speed canon interpolates', () => {
    const { gateway, emits } = build();

    (gateway as unknown as { handleEngineShutdown: (e: unknown) => void }).handleEngineShutdown({
      shipId: 'usr_pilot:1', userid: 'usr_pilot', shipno: 1, speed: 3000,
    });

    expect(emits[0].payload).toEqual({
      category: 'alert',
      text: formatMessage(MessageId.HELM_NOACCEL, 3000),
    });
    // Canon's own quirk: `(int)ptr->speed`, not the warp factor.
    expect(String((emits[0].payload as { text: string }).text)).toContain('3000');
  });
});
