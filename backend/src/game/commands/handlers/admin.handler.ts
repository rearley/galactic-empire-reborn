import { Injectable } from '@nestjs/common';
import { PlanetStateService } from '../../planet/planet-state.service';
import { AdminChange, planetKey } from '../../planet/planet-state.types';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { resolveItemKeyword, parseUint32 } from '../validators';
import { ITEM_NAMES, NUMITEMS } from '../../constants/items';

/**
 * Handles the `admin` / `adm` command — planet owner configuration.
 * @see GECMDS.C:3462 cmd_admin
 */
@Injectable()
export class AdminHandlerService {
  constructor(private readonly planetService: PlanetStateService) {}

  get command(): Command {
    return {
      keyword: 'admin',
      aliases: ['adm'],
      minArgs: 0,
      argMissingMessage: '',
      handler: (ship: ShipState, args: string[], ctx: CommandContext): Promise<CommandResult> =>
        this.handle(ship, args, ctx),
    };
  }

  private async handle(ship: ShipState, args: string[], _ctx: CommandContext): Promise<CommandResult> {
    if (ship.where < 10) {
      return { lines: [{ text: formatMessage(MessageId.ADM_NOT_LANDED), category: 'system' }] };
    }

    const plnum = ship.where - 10;
    const xsect = Math.floor(ship.xcoord);
    const ysect = Math.floor(ship.ycoord);
    const state = this.planetService.get(xsect, ysect, plnum);

    if (!state || state.userid !== ship.userid) {
      return { lines: [{ text: formatMessage(MessageId.ADM_NOT_OWNER), category: 'system' }] };
    }

    const sub = args[0]?.toLowerCase();
    if (!sub) {
      // Bare adm — show planet inventory status
      const lines: CommandResult['lines'] = [];
      lines.push({ text: `${state.name} — Inventory`, category: 'system' });
      lines.push({ text: '--------------------------------', category: 'system' });
      let hasAny = false;
      for (let i = 0; i < NUMITEMS; i++) {
        const item = state.items[i];
        const qty = Number(item.qty);
        if (qty === 0 && item.rate === 0) continue;
        hasAny = true;
        const sellFlag = item.sell ? 'sell=Y' : 'sell=N';
        const name = ITEM_NAMES[i];
        const dots = '.'.repeat(Math.max(1, 20 - name.length));
        lines.push({
          text: `${name}${dots}${qty.toLocaleString()}  rate:${item.rate}  price:${item.markup2a}  ${sellFlag}  reserve:${item.reserve}`,
          category: 'info',
        });
      }
      if (!hasAny) {
        lines.push({ text: '(no items in stock, no rates set)', category: 'info' });
      }
      lines.push({ text: `Tax rate: ${state.taxrate}%  Cash: ${Number(state.tax).toLocaleString()} cr`, category: 'info' });
      lines.push({ text: `Commands: adm rate/markup/sellflag/reserve/tax/beacon/password`, category: 'system' });
      return { lines };
    }

    const key = planetKey(xsect, ysect, plnum);
    let change: AdminChange | undefined;

    switch (sub) {
      case 'rate': {
        const itemIndex = resolveItemKeyword(args[1] ?? '');
        const value = parseUint32(args[2] ?? '');
        if (itemIndex === -1 || value === undefined || value > 100) {
          return { lines: [{ text: 'Rate must be 0–100.', category: 'system' }] };
        }
        change = { type: 'rate', itemIndex, value };
        break;
      }
      case 'markup': {
        const itemIndex = resolveItemKeyword(args[1] ?? '');
        const value = parseUint32(args[2] ?? '');
        if (itemIndex === -1 || value === undefined) {
          return { lines: [{ text: formatMessage(MessageId.ADM_INVALID), category: 'system' }] };
        }
        change = { type: 'markup', itemIndex, value };
        break;
      }
      case 'sellflag': {
        const itemIndex = resolveItemKeyword(args[1] ?? '');
        const onOff = args[2]?.toLowerCase();
        if (itemIndex === -1 || (onOff !== 'on' && onOff !== 'off')) {
          return { lines: [{ text: formatMessage(MessageId.ADM_INVALID), category: 'system' }] };
        }
        change = { type: 'sellflag', itemIndex, value: onOff === 'on' };
        break;
      }
      case 'reserve': {
        const itemIndex = resolveItemKeyword(args[1] ?? '');
        const value = parseUint32(args[2] ?? '');
        if (itemIndex === -1 || value === undefined) {
          return { lines: [{ text: formatMessage(MessageId.ADM_INVALID), category: 'system' }] };
        }
        change = { type: 'reserve', itemIndex, value };
        break;
      }
      case 'tax': {
        const value = parseUint32(args[1] ?? '');
        if (value === undefined) {
          return { lines: [{ text: formatMessage(MessageId.ADM_INVALID), category: 'system' }] };
        }
        change = { type: 'taxrate', value: Math.min(119, value) };
        break;
      }
      case 'beacon': {
        const value = args.slice(1).join(' ');
        change = { type: 'beacon', value };
        break;
      }
      case 'password': {
        const value = args[1] ?? 'none';
        change = { type: 'password', value };
        break;
      }
      default:
        return { lines: [{ text: formatMessage(MessageId.ADM_INVALID), category: 'system' }] };
    }

    const result = await this.planetService.applyAdminChange(key, ship.userid, change);
    if (!result.ok) {
      return { lines: [{ text: formatMessage(MessageId.ADM_INVALID), category: 'system' }] };
    }

    return { lines: [{ text: formatMessage(MessageId.ADM_OK), category: 'success' }] };
  }
}
