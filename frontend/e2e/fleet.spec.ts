import { test, expect } from '@playwright/test';
import {
  LOG, INPUT, startNewPilot, sendCommand, uniqueShipName, grantCredits, reconnect,
} from './helpers';

/**
 * Owning more than one hull.
 *
 * The gateway emits `prompt:ship-select` for a multi-ship captain and boards
 * nothing until it gets a reply. Nothing on the client listened for that event,
 * and the reply the client does send is a NUMBER while the gateway accepted
 * strings only — so buying a second ship left the account connected with no
 * active ship and "No active ship." as the answer to every command. The backend
 * integration suite was green throughout: it sent strings and never rendered a
 * page.
 *
 * @see specs/030-multi-ship/task-7-brief.md T7
 */
const SECOND_HULL_PRICE = 500_000;

test.describe('multi-ship fleet', () => {
  test('a captain who buys a second hull gets a menu and can fly either one', async ({ page, request }) => {
    const first = uniqueShipName('fleetA');
    await startNewPilot(page, first);

    // `new ship` trades at Zygor, and buying requires orbit.
    await grantCredits(request, first, SECOND_HULL_PRICE * 3);
    await sendCommand(page, 'orb 1');
    await expect(page.locator(LOG)).toContainText('Zygor');
    await sendCommand(page, 'new ship 2');
    await expect(page.locator(LOG)).toContainText('proud owner');

    await reconnect(page);

    const menu = page.getByTestId('ship-select');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(first);
    // The command line is withheld until a hull is chosen.
    await expect(page.locator(INPUT)).toHaveCount(0);

    await page.getByTestId('ship-select-input').fill('2');
    await page.getByTestId('ship-select-input').press('Enter');

    await expect(page.locator(INPUT)).toBeVisible();
    await expect(page.locator(LOG)).toContainText('Welcome aboard');
    // Boarded the second hull, not the first.
    await sendCommand(page, 'rep nav');
    await expect(page.locator(LOG)).not.toContainText(`Interceptor — ${first}`);
  });

  test('an out-of-range choice re-offers the menu instead of stranding the pilot', async ({ page, request }) => {
    const first = uniqueShipName('fleetB');
    const username = await startNewPilot(page, first);

    await grantCredits(request, first, SECOND_HULL_PRICE * 3);
    await sendCommand(page, 'orb 1');
    await sendCommand(page, 'new ship 2');
    await expect(page.locator(LOG)).toContainText('proud owner');

    await reconnect(page);
    await expect(page.getByTestId('ship-select')).toBeVisible();

    // The client itself refuses an index outside the fleet, so the pilot is
    // never left staring at a dead prompt.
    await page.getByTestId('ship-select-input').fill('9');
    await page.getByTestId('ship-select-input').press('Enter');
    await expect(page.getByTestId('ship-select')).toBeVisible();
    await expect(page.locator(INPUT)).toHaveCount(0);

    await page.getByTestId('ship-select-input').fill('1');
    await page.getByTestId('ship-select-input').press('Enter');
    await expect(page.locator(INPUT)).toBeVisible();
    await expect(page.locator(LOG)).toContainText(`Welcome aboard Commander ${username}`);
  });
});
