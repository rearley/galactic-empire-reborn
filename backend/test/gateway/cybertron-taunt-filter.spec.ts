import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { CYBERTRON_EVENT } from '../../src/game/cybertron/cybertron-events';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';

/**
 * `set filter on` silences Cybertron taunts.
 *
 * Canon sends every taunt with the FILTER class:
 *
 * @see GECYBS.C:403 `outprfge(FILTER,usrn);`
 * @see GEMAIN.C:2563 `if (class == FILTER && (warusroff(shpno)->options[MSG_FILTER] == TRUE))`
 *
 * which drops the message for any pilot who set the option. Compare ALWAYS at
 * GEMAIN.C:2558 `if (class == ALWAYS)`, which bypasses the check; that is the
 * class the unmissable messages use.
 *
 * The port honoured `msgFilter` for arrival/departure notices and the kill
 * broadcast, but emitted taunts unconditionally — so the one option a pilot has
 * for quieting the galaxy did nothing about the chattiest thing in it.
 */
describe('a Cybertron taunt respects the filter option', () => {
  const TARGET = 'usr_target';

  const build = (ships: Array<{ userid: string; msgFilter: boolean }>) => {
    const emits: Array<{ rooms: string[]; except: string[]; payload: unknown }> = [];
    const shipStateService = {
      findAllShips: () => ships,
      findByUserid: () => [],
      get: vi.fn(),
    } as unknown as ShipStateService;

    const gateway = makeGateway({
      shipStateService,
      wsAuthGuard: { validate: vi.fn() } as unknown as WsAuthGuard,
      scanHandler: { clearScantab: vi.fn() } as unknown as ScanHandlerService,
      random: mockRandom,
    });
    (gateway as unknown as { server: unknown }).server = {
      emit: vi.fn(),
      to: function chain(room: string) {
        const rooms = [room];
        const except: string[] = [];
        const node = {
          to: (r: string) => { rooms.push(r); return node; },
          except: (r: string | string[]) => {
            except.push(...(Array.isArray(r) ? r : [r]));
            return node;
          },
          emit: (_event: string, payload: unknown) => emits.push({ rooms, except, payload }),
        };
        return node;
      },
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return { gateway, emits };
  };

  const taunt = {
    attackerShipKey: 'Cybrg-222:1',
    targetShipKey: `${TARGET}:1`,
    message: 'You cannot run forever.',
    band: 'brake',
    sector: { x: 3, y: 4 },
    tickAt: 1,
  };

  const fire = (gateway: unknown) =>
    (gateway as { handleCybertronTaunt: (e: unknown) => void }).handleCybertronTaunt(taunt);

  it('excludes a pilot who asked for quiet', () => {
    const { gateway, emits } = build([{ userid: 'usr_quiet', msgFilter: true }]);
    fire(gateway);
    expect(emits[0].except).toContain('user:usr_quiet');
  });

  it('leaves everyone else alone', () => {
    const { gateway, emits } = build([{ userid: 'usr_loud', msgFilter: false }]);
    fire(gateway);
    expect(emits[0].except).not.toContain('user:usr_loud');
  });

  it('silences the TARGET’s own copy when the target filtered', () => {
    // The case canon is actually describing: `usrn` in `outprfge(FILTER, usrn)`
    // IS the taunted pilot. Excluding bystanders but still addressing the
    // target would honour the option for everyone except the person it was
    // aimed at.
    const { gateway, emits } = build([{ userid: TARGET, msgFilter: true }]);
    fire(gateway);
    expect(emits[0].except).toContain(`user:${TARGET}`);
  });

  it('still addresses the target and the taunter’s sector', () => {
    // The routing fix this sits on top of must survive. @see
    // cybertron-taunt-routing.spec.ts
    const { gateway, emits } = build([]);
    fire(gateway);
    expect(emits[0].rooms).toEqual([`user:${TARGET}`, 'sector:3:4']);
  });
});
