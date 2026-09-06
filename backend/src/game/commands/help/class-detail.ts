import { CLASS_HELP } from './class-help.generated';
import { SHIP_CLASSES } from '../../../../prisma/seed/ship-classes';
import { FIRST_CPU_CLASS } from '../handlers/new-ship.handler';

/**
 * Canon's answer when the class number is not one you can buy.
 *
 *   HLPCLS3 {Type HELP CLASS for a list of valid ship classes.}
 *
 * @see GECMDS.C:448-452
 */
const HLPCLS3 = ['Type HELP CLASS for a list of valid ship classes.'];

/**
 * `hel class <n>` — the per-class detail page.
 *
 *   if (margc == 3) {
 *       i = atoi(margv[2])-1;
 *       if (i < cyb_class && shipclass[i].max_type == CLASSTYPE_USER)
 *           prfmsg(shipclass[i].hlpmsg);
 *       else
 *           prfmsg(HLPCLS3);
 *   }
 *   -- GECMDS.C:438-453
 *
 * The gate is the same one the summary table uses: a PLAYER-category hull below
 * `cyb_class`. Canon's own condition reads `(i > 0 || i < cyb_class)`, an `||`
 * where every other bound in the file uses `&&` — so it admits any index at all
 * and relies on the `max_type` test beside it to reject the rest. We use the
 * conjunction the surrounding code plainly intends; the observable behaviour is
 * identical because `max_type` does the real work, and reproducing a typo that
 * changes nothing would only invite someone to "fix" it later.
 *
 * Returns null only for a missing argument, which the caller renders as the
 * summary table instead.
 */
export function classDetailPage(arg: string | undefined): readonly string[] | null {
  if (arg === undefined || arg.trim() === '') return null;

  const n = Number.parseInt(arg.trim(), 10);
  if (!Number.isInteger(n)) return HLPCLS3;

  const cls = SHIP_CLASSES.find((c) => c.classNumber === n);
  if (!cls || cls.category !== 'PLAYER' || cls.classNumber >= FIRST_CPU_CLASS) {
    return HLPCLS3;
  }

  const page = CLASS_HELP[n];
  return page && page.length > 0 ? page : HLPCLS3;
}
