import { Injectable } from '@nestjs/common';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { ShipStateService } from '../../ship/ship-state.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Registry entry for a toggleable ship option.
 */
interface SetOption {
  /** Command-line name, e.g. 'auto-shield' */
  name: string;
  /** Display label used in `set ?` listing */
  label: string;
  get(ship: ShipState): boolean;
  set(ship: ShipState, value: boolean, shipState: ShipStateService, prisma: PrismaService): Promise<void> | void;
}

/**
 * Handles `set <option> <on|off>` and `set ?`.
 *
 * Options: canon's four — scannames, scanhome, scanfull, filter.
 * `auto-shield` and `auto-repair` were port inventions and are gone: canon's
 * help forbids the first outright (HLPSHI, "They WILL NOT be automatically
 * raised after the firing") and the second spent the pilot's cash unasked.
 * @see test/game/commands/handlers/set-canon-options.spec.ts
 * `set ?` lists all options with their current values on one pipe-separated line.
 *
 * scannames/scanhome are persisted via Prisma write-through (User.options[0/1])
 * in addition to updating the in-memory ShipState cache.
 *
 * @see GECMDS.C cmd_set — `#define NUMOPTS 4`
 * @see research.md D4
 * @see contracts/scan-render.md §4
 */
@Injectable()
export class SetHandlerService {
  private readonly registry: SetOption[] = [
    {
      name: 'scannames',
      label: 'scannames',
      get: (ship) => ship.scanNames,
      set: async (ship, value, shipState, prisma) => {
        shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.scanNames = value;
        });
        const user = await prisma.user.findUnique({
          where: { userid: ship.userid },
          select: { options: true },
        });
        const options = [...(user?.options ?? [])];
        while (options.length <= 0) options.push(0);
        options[0] = value ? 1 : 0;
        await prisma.user.update({ where: { userid: ship.userid }, data: { options } });
      },
    },
    {
      name: 'scanhome',
      label: 'scanhome',
      get: (ship) => ship.scanHome,
      set: async (ship, value, shipState, prisma) => {
        shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.scanHome = value;
        });
        const user = await prisma.user.findUnique({
          where: { userid: ship.userid },
          select: { options: true },
        });
        const options = [...(user?.options ?? [])];
        while (options.length <= 1) options.push(0);
        options[1] = value ? 1 : 0;
        await prisma.user.update({ where: { userid: ship.userid }, data: { options } });
      },
    },
    {
      name: 'scanfull',
      label: 'scanfull',
      get: (ship) => ship.scanFull,
      set: async (ship, value, shipState, prisma) => {
        shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.scanFull = value;
        });
        const user = await prisma.user.findUnique({
          where: { userid: ship.userid },
          select: { options: true },
        });
        const options = [...(user?.options ?? [])];
        while (options.length <= 2) options.push(0);
        options[2] = value ? 1 : 0;
        await prisma.user.update({ where: { userid: ship.userid }, data: { options } });
      },
    },
    {
      name: 'filter',
      label: 'filter',
      get: (ship) => ship.msgFilter,
      set: async (ship, value, shipState, prisma) => {
        shipState.mutate(ship.userid, ship.shipno, (s) => {
          s.msgFilter = value;
        });
        const user = await prisma.user.findUnique({
          where: { userid: ship.userid },
          select: { options: true },
        });
        const options = [...(user?.options ?? [])];
        while (options.length <= 3) options.push(0);
        options[3] = value ? 1 : 0;
        await prisma.user.update({ where: { userid: ship.userid }, data: { options } });
      },
    },
  ];

  constructor(
    private readonly shipState: ShipStateService,
    private readonly prisma: PrismaService,
  ) {}

  readonly command: Command = {
    keyword: 'set',
    aliases: [],
    minArgs: 1,
    argMissingMessage: formatMessage(MessageId.SET_FMT),
    handler: (ship: ShipState, args: string[], _ctx: CommandContext): CommandResult | Promise<CommandResult> =>
      this.handle(ship, args),
  };

  private async handle(ship: ShipState, args: string[]): Promise<CommandResult> {
    const optArg = args[0]?.toLowerCase() ?? '';

    if (optArg === '?') {
      const statusLine = this.registry
        .map((opt) => `${opt.label}: ${opt.get(ship) ? 'ON' : 'OFF'}`)
        .join(' | ');
      return {
        lines: [{ text: formatMessage(MessageId.SET_STATUS, statusLine), category: 'info' }],
      };
    }

    const entry = this.registry.find((o) => o.name === optArg);
    if (!entry) {
      return { lines: [{ text: formatMessage(MessageId.SET_UNKNOWN), category: 'system' }] };
    }

    const toggleArg = args[1]?.toLowerCase() ?? '';
    if (toggleArg !== 'on' && toggleArg !== 'off') {
      return { lines: [{ text: formatMessage(MessageId.SET_FMT), category: 'system' }] };
    }

    const newVal = toggleArg === 'on';
    await entry.set(ship, newVal, this.shipState, this.prisma);

    const msgId = newVal ? MessageId.SET_OK_ON : MessageId.SET_OK_OFF;
    return { lines: [{ text: formatMessage(msgId, optArg), category: 'success' }] };
  }
}
