/**
 * Damage Control's four reports reach the captain whose system came back.
 *
 * @see GEFUNCS.C:1021 PHREPR, :1059 TAREPR, :1070 HLREPR, :1080 FCREPR
 *
 * Each is a distinct line naming the system, because "something is fixed" is
 * not actionable — a pilot needs to know whether it is the helm (they can
 * steer again), fire control (they can lock again), the tactical display (they
 * can scan again) or the phaser bank (they can shoot again).
 */
import { GameGateway } from '../../src/gateway/game.gateway';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { ShipSystemRepairedEvent, RepairedSystem } from '../../src/game/ship/repair-events';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { makeGateway } from '../helpers/make-gateway';

interface Emit { rooms: string[]; event: string; payload: unknown }

function build() {
  const emits: Emit[] = [];
  const gateway = makeGateway({
    registry: { getSocketId: () => undefined } as unknown as ConnectedShipsRegistry,
    scanHandler: { lettersFor: () => [] } as unknown as ScanHandlerService,
  });
  const chain = (rooms: string[]) => ({
    to: (r: string) => chain([...rooms, r]),
    emit: (event: string, payload: unknown) => { emits.push({ rooms, event, payload }); },
  });
  (gateway as unknown as { server: unknown }).server = { to: (r: string) => chain([r]) };
  return { gateway, emits };
}

const fire = (gateway: GameGateway, system: RepairedSystem) =>
  (gateway as unknown as { handleSystemRepaired: (e: ShipSystemRepairedEvent) => void })
    .handleSystemRepaired({ shipId: 'usr_a:1', system, tickAt: new Date() });

describe('Damage Control routing (GEFUNCS.C:1021-1080)', () => {
  it.each<[RepairedSystem, MessageId]>([
    ['phaser', MessageId.REPAIR_PHASER],
    ['tactical', MessageId.REPAIR_TACTICAL],
    ['helm', MessageId.REPAIR_HELM],
    ['firecntl', MessageId.REPAIR_FIRECNTL],
  ])('reports %s to the ship that owns it', (system, messageId) => {
    const { gateway, emits } = build();

    fire(gateway, system);

    expect(emits).toHaveLength(1);
    expect(emits[0].rooms).toEqual(['user:usr_a']);
    expect(emits[0].payload).toEqual({
      category: 'system',
      text: formatMessage(messageId),
    });
  });

  it('names a different system in each line', () => {
    const texts = (['phaser', 'tactical', 'helm', 'firecntl'] as RepairedSystem[]).map((sys) => {
      const { gateway, emits } = build();
      fire(gateway, sys);
      return String((emits[0].payload as { text: string }).text);
    });

    expect(new Set(texts).size).toBe(4);
  });
});
