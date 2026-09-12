import { OnboardingService } from '../../../src/game/onboarding/onboarding.service';
import { SHIP_CLASSES } from '../../../prisma/seed/ship-classes';
import { FIRST_CPU_CLASS } from '../../../src/game/ship/buyable-class';

/**
 * Onboarding must offer the same classes `new ship` sells.
 *
 * Both of its selectors filtered on `category: 'PLAYER'` alone and carried no
 * `classNumber < cyb_class` bound, which is the exact filter already found to
 * advertise the Sysopian Death Star — class 41, ~32M credits, warp 255 — to
 * every pilot. `new-ship.handler.ts` has carried the bound since that was
 * fixed, so the codebase held two definitions of one rule and one of them was
 * the known-wrong version. @see issue #21
 *
 * Not reachable by a player today: `finalize()` hardcodes START_CLASS and
 * nothing in src/ calls either method. That is what makes it worth pinning —
 * the next person to wire a class chooser inherits a working-looking helper.
 */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v !== null && typeof v === 'object' && 'lt' in (v as object)) {
      return (row[k] as number) < (v as { lt: number }).lt;
    }
    return row[k] === v;
  });
}

function serviceOverClassTable(): OnboardingService {
  const prisma = {
    shipClass: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) =>
        SHIP_CLASSES.filter((c) => matches(c as never, args.where)),
      ),
      findFirst: vi.fn(async (args: { where: Record<string, unknown> }) =>
        SHIP_CLASSES.find((c) => matches(c as never, args.where)) ?? null,
      ),
    },
  };
  return new OnboardingService(prisma as never, {} as never, {} as never, {} as never);
}

describe('onboarding offers only what a player may buy', () => {
  it('leaves every class at or above cyb_class off the list', async () => {
    const list = await serviceOverClassTable().buildClassListPayload();
    expect(list.length).toBeGreaterThan(0);
    expect(list.filter((c) => c.classNumber >= FIRST_CPU_CLASS)).toEqual([]);
  });

  it('does not advertise the Sysopian Death Star', async () => {
    const list = await serviceOverClassTable().buildClassListPayload();
    expect(list.map((c) => c.classNumber)).not.toContain(41);
  });

  it('refuses a reply naming the Death Star', async () => {
    await expect(serviceOverClassTable().validateClassReply(41)).resolves.toBe(false);
  });

  it('still accepts a real starter class', async () => {
    await expect(serviceOverClassTable().validateClassReply(1)).resolves.toBe(true);
  });
});
