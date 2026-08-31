import { test, expect } from '@playwright/test';
import {
  LOG, INPUT, startNewPilot, sendCommand, uniqueShipName, outfitShip, spawnDroid, reconnect,
} from './helpers';

/**
 * The scan panels — the two UI regions besides the log and the command line.
 *
 * `sca lo full` produces a side-panel legend of contacts (letter, distance,
 * bearing, heading, speed) which is how a pilot picks a lock target. Its
 * heading came straight off the ship state unrounded, so a contact under way
 * rendered as "Hdg:69.83440234557376" — every other field is an integer, and
 * in a fixed-width terminal that one float pushes the whole row out of line.
 * Nothing below the browser could see it: the backend was returning a valid
 * number and the unit tests only checked the field existed.
 */
const RENDEZVOUS = { x: 24.5, y: 6.5 };

test.describe('scan panels', () => {
  test('the contact legend lists a nearby ship in whole numbers', async ({ page, request }) => {
    const ship = uniqueShipName('scan');
    await startNewPilot(page, ship);

    await spawnDroid(request, {
      class: 32,
      x: RENDEZVOUS.x + 0.2,
      y: RENDEZVOUS.y + 0.1,
      stationary: true,
    });
    await outfitShip(request, { shipname: ship, x: RENDEZVOUS.x, y: RENDEZVOUS.y });
    await reconnect(page);
    await expect(page.locator(INPUT)).toBeVisible();

    await sendCommand(page, 'sca lo full');

    const legend = page.getByTestId('scan-card-side-panel');
    await expect(legend).toBeVisible();

    const row = await legend.innerText();
    expect(row).toMatch(/^A /m);
    // Distance, bearing and heading are all whole numbers.
    expect(row).toMatch(/\d+pc/);
    expect(row).toMatch(/Brg:\d+(\s|$)/);
    expect(row).toMatch(/Hdg:\d+(\s|$)/);
    expect(row).not.toMatch(/Hdg:\d+\./);
  });

  test('a local scan paints the sector grid and names the range in parsecs', async ({ page }) => {
    const ship = uniqueShipName('grid');
    await startNewPilot(page, ship);

    await sendCommand(page, 'sca lo');

    // The pilot's own ship is the '*' at the centre of the grid.
    await expect(page.getByTestId('scan-map')).toContainText('*');
    await expect(page.locator(LOG)).toContainText('pc — Sector 0,0');
  });
});
