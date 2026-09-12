import { Injectable } from '@nestjs/common';
import { PLANET_NAME_MAX, PlanetStateService } from '../../planet/planet-state.service';
import { AdminChange, planetKey } from '../../planet/planet-state.types';
import { Command, CommandContext, CommandResult } from '../command.types';
import { formatMessage, MessageId } from '../messages';
import { ShipState } from '../../ship/ship-state.types';
import { resolveItemKeyword, parseUint32 } from '../validators';
import { ITEM_NAMES, NUMITEMS } from '../../constants/items';
import { parseTaxRate } from './helpers/tax-rate';
import { MAXPLNTS } from '../../constants';
import { describeTradeAccess } from './helpers/trade-access-label';
import { isPrintableBeacon } from '../../ship/beacon';
/** BEACONMSGSZ — GEMAIN.H. The adm help already advertises 75. */
const BEACON_MAX = 75;

/**
 * Handles the `admin` / `adm` command — planet owner configuration.
 * @see GECMDS.C:3462 cmd_admin
 */
/**
 * Sub-command usage, shown by bare `adm` and by any malformed sub-command.
 *
 * Listing the names alone was not enough to use the command: `rate`, `markup`,
 * `reserve` and `sellflag` all take `<item>` before their value, and getting
 * the order wrong produced a bare "Invalid value." with no correction.
 */
const ADMIN_USAGE: readonly string[] = [
  'Commands:',
  '  adm rate <item> <0-100>        production rate',
  '  adm markup <item> <value>      price OTHERS pay (you pay base)',
  '  adm sellflag <item> on|off     offer item to visitors',
  '  adm reserve <item> <value>     hold back from sale',
  '  adm tax <0-100>                tax rate',
  '  adm rename <name>              rename the colony (19 chars)',
  '  adm beacon <message>           message shown to visitors',
  '  adm password <word|none|team>  who may trade here',
];

/** Invalid-value message followed by the full sub-command usage. */
function usageError(): CommandResult {
  return {
    lines: [
      { text: formatMessage(MessageId.ADM_INVALID), category: 'system' },
      ...ADMIN_USAGE.map((text) => ({ text, category: 'system' as const })),
    ],
  };
}

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

    if (!state) {
      return { lines: [{ text: formatMessage(MessageId.ADM_NOT_OWNER), category: 'system' }] };
    }

    // An unclaimed planet is offered to you, as C does. `adm` is where
    // claiming lives in the original — the command table has no `land`
    // (GECMDS.C:122) — and the flow is mnu_admenu1 "do you wish to claim this
    // planet" followed by mnu_admenu1a "enter the name" (GEMAIN.C:2899-2981).
    if (state.userid === null) {
      return await this.offerClaim(ship, state, args);
    }

    if (state.userid !== ship.userid) {
      return { lines: [{ text: formatMessage(MessageId.ADM_NOT_OWNER), category: 'system' }] };
    }

    const sub = args[0]?.toLowerCase();
    if (!sub) {
      // Bare adm — show planet inventory status
      const lines: CommandResult['lines'] = [];
      lines.push({ text: `${state.name} — Inventory`, category: 'system' });
      lines.push({ text: '--------------------------------', category: 'system' });
      // Canon's loop is `for (i=0; i<NUMITEMS; ++i)` with no filter
      // (GEMAIN.C:2999). The port skipped any slot with no stock and no rate,
      // so an item priced and reserved but currently empty vanished — and its
      // settings could then only be corrected blind.
      for (let i = 0; i < NUMITEMS; i++) {
        const item = state.items[i];
        const qty = Number(item.qty);
        const sellFlag = item.sell ? 'sell=Y' : 'sell=N';
        const name = ITEM_NAMES[i];
        const dots = '.'.repeat(Math.max(1, 20 - name.length));
        lines.push({
          // `sold2a` is the running units-sold counter, ADMIN02's 'Sold'
          // column. It was carried in state, persisted, and read nowhere, so
          // an owner could never see how much their colony had actually moved.
          text: `${name}${dots}${qty.toLocaleString()}  rate:${item.rate}  price:${item.markup2a}  ${sellFlag}  reserve:${item.reserve}  sold:${Number(item.sold2a ?? 0n).toLocaleString()}`,
          category: 'info',
        });
      }
      // C prints four separate lines here — planet cash, the tax pool, the
      // rate, and who may trade (GEMAIN.C:3018-3024). This showed only two, and
      // labelled the TAX POOL as "Cash", so an owner could never see the
      // planet's own cash or the landing password they had set.
      lines.push({ text: `Cash: ${Number(state.cash).toLocaleString()} cr   Tax collected: ${Number(state.tax).toLocaleString()} cr`, category: 'info' });
      lines.push({ text: `Tax rate: ${state.taxrate}%`, category: 'info' });
      lines.push({ text: `Trading: ${describeTradeAccess(state.password, state.teamcode)}`, category: 'info' });
      lines.push(...ADMIN_USAGE.map((text) => ({ text, category: 'system' as const })));
      return { lines };
    }

    const key = planetKey(xsect, ysect, plnum);
    let change: AdminChange | undefined;

    switch (sub) {
      case 'rate': {
        const itemIndex = resolveItemKeyword(args[1] ?? '');
        const value = parseUint32(args[2] ?? '');
        if (itemIndex === -1 || value === undefined || value > 100) {
          return usageError();
        }
        change = { type: 'rate', itemIndex, value };
        break;
      }
      case 'markup': {
        const itemIndex = resolveItemKeyword(args[1] ?? '');
        const value = parseUint32(args[2] ?? '');
        if (itemIndex === -1 || value === undefined) {
          return usageError();
        }
        change = { type: 'markup', itemIndex, value };
        break;
      }
      case 'sellflag': {
        const itemIndex = resolveItemKeyword(args[1] ?? '');
        const onOff = args[2]?.toLowerCase();
        if (itemIndex === -1 || (onOff !== 'on' && onOff !== 'off')) {
          return usageError();
        }
        change = { type: 'sellflag', itemIndex, value: onOff === 'on' };
        break;
      }
      case 'reserve': {
        const itemIndex = resolveItemKeyword(args[1] ?? '');
        const value = parseUint32(args[2] ?? '');
        if (itemIndex === -1 || value === undefined) {
          return usageError();
        }
        change = { type: 'reserve', itemIndex, value };
        break;
      }
      case 'tax': {
        // Clamping here meant the service's range check could never fire, so
        // `adm tax 150` stored 100 and answered "Setting saved." — the one adm
        // setter that confirmed a value it had not saved. C refuses instead.
        // @see helpers/tax-rate.ts, GEMAIN.C:3224
        const rate = parseTaxRate(args[1] ?? '');
        if (!rate.ok) {
          return usageError();
        }
        change = { type: 'taxrate', value: rate.value };
        break;
      }
      case 'rename': {
        // Admin menu item 4. Canon uppercases the first letter and truncates
        // at 19 (`strncpy(plptr->name,margv[0],19); name[19] = 0`), and an
        // empty entry re-prompts rather than clearing the name.
        // @see GEMAIN.C:2955-2959
        const raw = args.slice(1).join(' ').trim();
        if (raw === '') return usageError();
        const value = (raw.charAt(0).toUpperCase() + raw.slice(1)).slice(0, PLANET_NAME_MAX);
        change = { type: 'name', value };
        break;
      }
      case 'beacon': {
        // Sanitise on WRITE as well as on read. This is the one place in the
        // game where text written by one player is rendered on another
        // player's screen, so a control character here is a terminal escape
        // sequence delivered to every ship that flies past. Canon strips it at
        // read time by blanking the whole beacon (GEMAIN.C:1817-1824); doing it
        // on write too means the operator sees the rejection rather than
        // wondering later why their beacon never appears.
        const raw = args.slice(1).join(' ');
        if (raw !== '' && !isPrintableBeacon(raw)) {
          return {
            lines: [{
              text: 'Beacon message must be plain printable text, Sir!',
              category: 'system' as const,
            }],
          };
        }
        change = { type: 'beacon', value: raw.slice(0, BEACON_MAX) };
        break;
      }
      case 'password': {
        const value = args[1] ?? 'none';
        change = { type: 'password', value, ownerTeamcode: ship.teamcode ?? null };
        break;
      }
      default:
        return usageError();
    }

    const result = await this.planetService.applyAdminChange(key, ship.userid, change);
    if (!result.ok) {
      return { lines: [{ text: formatMessage(MessageId.ADM_INVALID), category: 'system' }] };
    }

    // Canon answers a rate change with the budget state, not a bare OK: it
    // says when your figure was cut to fit (ADMEN2FA) and how much effort is
    // still unassigned (ADMEN2FB). @see GEMAIN.C:3550-3565
    const lines: CommandResult['lines'] = [
      { text: formatMessage(MessageId.ADM_OK), category: 'success' },
    ];
    if (result.rateClamp) {
      const { clamped, value, unassigned } = result.rateClamp;
      if (clamped) {
        lines.push({
          text: formatMessage(MessageId.ADMEN2FA, ITEM_NAMES[change.type === 'rate' ? change.itemIndex : 0] ?? '', value),
          category: 'system',
        });
      }
      if (unassigned > 0) {
        lines.push({ text: formatMessage(MessageId.ADMEN2FB, unassigned), category: 'system' });
      }
    }
    return { lines };
  }

  /**
   * C's two-step claim: offer, then name.
   *
   *   mnu_admenu1  — "do you wish to claim this planet" (y/n); on yes it sets
   *                  plptr->userid, ++planets and resets every rate to 0 bar
   *                  men and food at 50, then prompts ADMENU1A.
   *   mnu_admenu1a — takes the name and drops you into the admin menu.
   *
   * The rate reset lives in PlanetStateService.claim, which both steps share.
   * @see GEMAIN.C:2899-2981
   */
  private async offerClaim(
    ship: ShipState,
    state: { xsect: number; ysect: number; plnum: number },
    args: string[],
  ): Promise<CommandResult> {
    const first = args[0]?.toLowerCase();

    if (first === undefined) {
      return {
        lines: [{ text: formatMessage(MessageId.ADM_CLAIM_OFFER), category: 'system' }],
        expectFollowup: 'adm',
      };
    }

    if (first === 'yes' || first === 'y') {
      return {
        lines: [{ text: formatMessage(MessageId.LAND_NAME_PROMPT), category: 'system' }],
        expectFollowup: 'adm claim',
      };
    }

    if (first !== 'claim') {
      // Anything other than a confirmation ends it — re-prompting here would
      // re-arm expectFollowup and eat the captain's next command.
      return { lines: [{ text: formatMessage(MessageId.ADM_CLAIM_DECLINED), category: 'system' }] };
    }

    const name = args.slice(1).join(' ').trim();
    if (name.length < 1 || name.length > 19 || !/^[\x20-\x7E]+$/.test(name)) {
      return { lines: [{ text: formatMessage(MessageId.LAND_INVALID_NAME), category: 'system' }] };
    }

    const claimed = await this.planetService
      .claim(state.xsect, state.ysect, state.plnum, ship.userid, name)
      .catch(() => ({ ok: false as const, reason: 'NOT_FOUND' as const }));

    if (!claimed.ok) {
      const text =
        claimed.reason === 'PLANET_LIMIT'
          ? formatMessage(MessageId.LAND_PLANET_LIMIT, String(MAXPLNTS))
          : claimed.reason === 'NEUTRAL_ZONE'
            ? formatMessage(MessageId.LAND_NEUTRAL_ZONE)
            : formatMessage(MessageId.LAND_REFUSED);
      return { lines: [{ text, category: 'system' }] };
    }

    // ADMENU1B is the declaration itself, and canon names all four things:
    // the planet's number, its new name, the commander, and the ship it was
    // claimed from (GEMAIN.C:2966-2970). The port's line had only the name.
    return {
      lines: [
        {
          text: formatMessage(
            MessageId.LAND_CLAIMED,
            state.plnum,
            name,
            ship.username ?? ship.userid,
            ship.shipname,
          ),
          category: 'success',
        },
      ],
    };
  }

}
