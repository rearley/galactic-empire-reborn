import { test, expect } from '@playwright/test';
import { LOG, INPUT, startNewPilot, sendCommand, uniqueShipName, outfitShip, reconnect } from './helpers';

/**
 * Claiming and releasing a colony, driven entirely through the terminal.
 *
 * Two defects lived here that only a browser could see:
 *
 *  - `land` on an unowned planet asks "What would you like to name this
 *    planet?", but the answer went through the command router. Under 3-char
 *    prefix matching a name like "New Terra" matched the `new` verb and printed
 *    the `new ship` usage line, leaving the planet unclaimed with no hint that
 *    `land <name>` was the real syntax.
 *  - `aba` — C's colony-abandonment command — had been reinterpreted as
 *    abandon-*ship*, so there was no way to give a planet up at all.
 *
 * The far corner of the galaxy, chosen so the test does not contend with
 * playtest state near the neutral zone. The pilot releases the planet at the
 * end, so the spec is re-runnable.
 */
const OUTPOST = { plnum: 4, x: 29.3939, y: 14.1242 };

async function orbitTheOutpost(page: Page, ship: string, request: APIRequestContext): Promise<void> {
  await outfitShip(request, { shipname: ship, x: OUTPOST.x, y: OUTPOST.y });
  await reconnect(page);
  await expect(page.locator(INPUT)).toBeVisible();
  await sendCommand(page, `orb ${OUTPOST.plnum}`);
  await expect(page.locator(LOG)).toContainText('in orbit');
}

import type { Page, APIRequestContext } from '@playwright/test';

test.describe('colony lifecycle through the terminal', () => {
  test('the land prompt takes a free-text answer, even one that shadows a verb', async ({ page, request }) => {
    const ship = uniqueShipName('claim');
    await startNewPilot(page, ship);
    await orbitTheOutpost(page, ship, request);

    await sendCommand(page, 'lan');
    await expect(page.locator(LOG)).toContainText('What would you like to name this planet?');

    // "New Terra" begins with the `new` verb — the exact input that used to be
    // swallowed by the command router.
    await sendCommand(page, 'New Terra');
    await expect(page.locator(LOG)).toContainText('You have claimed New Terra');
    await expect(page.locator(LOG)).not.toContainText('USAGE: new ship');

    await sendCommand(page, 'pla');
    await expect(page.locator(LOG)).toContainText('New Terra');

    // Release it so the spec can run again.
    await sendCommand(page, 'aba');
    await expect(page.locator(LOG)).toContainText('You have abandoned New Terra');
  });

  test('a released planet leaves the roster and can be claimed again', async ({ page, request }) => {
    const ship = uniqueShipName('rel');
    await startNewPilot(page, ship);
    await orbitTheOutpost(page, ship, request);

    await sendCommand(page, 'lan');
    await sendCommand(page, 'Second Chance');
    await expect(page.locator(LOG)).toContainText('You have claimed Second Chance');

    await sendCommand(page, 'aba');
    await expect(page.locator(LOG)).toContainText('no longer yours');

    await sendCommand(page, 'pla');
    await expect(page.locator(LOG)).toContainText('You do not own any planets');

    // Still claimable — abandonment clears the owner and nothing else.
    await sendCommand(page, 'lan');
    await sendCommand(page, 'Third Time');
    await expect(page.locator(LOG)).toContainText('You have claimed Third Time');
    await sendCommand(page, 'aba');
  });

  test('abandoning without a planet under you is refused', async ({ page }) => {
    const ship = uniqueShipName('noorb');
    await startNewPilot(page, ship);

    await sendCommand(page, 'aba');
    await expect(page.locator(LOG)).toContainText('must be in orbit');
  });

  test("abandoning someone else's planet is refused", async ({ page, request }) => {
    const ship = uniqueShipName('notmine');
    await startNewPilot(page, ship);
    // Zygor-3 belongs to the neutral-zone hub, not to this pilot.
    await sendCommand(page, 'orb 1');
    await expect(page.locator(LOG)).toContainText('Zygor');

    await sendCommand(page, 'aba');
    await expect(page.locator(LOG)).toContainText('not yours to abandon');
  });
});
