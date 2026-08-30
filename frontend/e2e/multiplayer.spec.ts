import { test, expect, type Page } from '@playwright/test';
import { LOG, startNewPilot, sendCommand, uniqueShipName, outfitShip } from './helpers';

/**
 * Two real clients in one world.
 *
 * Nothing at any other layer exercises concurrent players: the unit suite uses
 * a single synthetic ship, and the no-mock integration spec drives services
 * directly with no sockets at all. Sector-room broadcast, the shared player
 * registry and cross-client visibility are only real with two live connections.
 *
 * This also covers the "no safe zone but 0,0" concern: once other humans are
 * connected, every sector outside the neutral zone is contested, and that is
 * only meaningful if players can actually see and reach each other.
 */

/** A quiet corner well clear of the neutral zone. */
const MEETING_POINT = { x: 18.5, y: 8.5 };

async function pilotSector(page: Page): Promise<string> {
  await sendCommand(page, 'rep nav');
  const text = await page.locator(LOG).innerText();
  const m = [...text.matchAll(/In sector \((\d+), (\d+)\)/g)];
  return m.length ? `${m[m.length - 1][1]},${m[m.length - 1][2]}` : '';
}

test.describe('multiplayer — two concurrent clients', () => {
  test('each client sees the other in the player roster', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      const shipA = uniqueShipName('Alpha');
      const shipB = uniqueShipName('Bravo');

      await startNewPilot(pageA, shipA);
      await startNewPilot(pageB, shipB);

      // The registry is global (GameGateway emits registry.list() to every
      // client), so each pilot must appear in the other's Players panel.
      await expect(pageA.locator('[data-testid="player-list-panel"]')).toContainText(shipB);
      await expect(pageB.locator('[data-testid="player-list-panel"]')).toContainText(shipA);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('a pilot leaving is removed from the other roster', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      const shipA = uniqueShipName('Stay');
      const shipB = uniqueShipName('Leave');

      await startNewPilot(pageA, shipA);
      await startNewPilot(pageB, shipB);
      await expect(pageA.locator('[data-testid="player-list-panel"]')).toContainText(shipB);

      // Disconnecting must emit player.left and prune the roster.
      await ctxB.close();

      await expect(pageA.locator('[data-testid="player-list-panel"]')).not.toContainText(shipB, {
        timeout: 30_000,
      });
    } finally {
      await ctxA.close();
      await ctxB.close().catch(() => undefined);
    }
  });

  test('two pilots in the same sector can see each other on a local scan', async ({ browser, request }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      const shipA = uniqueShipName('SeeA');
      const shipB = uniqueShipName('SeeB');

      await startNewPilot(pageA, shipA);
      await startNewPilot(pageB, shipB);

      // Put both in the same non-neutral sector, a short distance apart.
      await outfitShip(request, { shipname: shipA, x: MEETING_POINT.x, y: MEETING_POINT.y });
      // 0.4 sectors apart: same sector (18.5 and 18.9 both floor to 18),
      // inside the 1.5-sector scan range that builds the
      // scantab, but far enough to land on a DIFFERENT grid cell. `sca lo`
      // projects 4.5 sectors across 30 columns (~0.3 sectors per cell) and
      // paints the self-marker last, so a closer ship is overwritten by '*'.
      await outfitShip(request, { shipname: shipB, x: MEETING_POINT.x + 0.4, y: MEETING_POINT.y });

      await expect
        .poll(async () => pilotSector(pageA), { timeout: 30_000, intervals: [3_000] })
        .toBe('18,8');
      await expect
        .poll(async () => pilotSector(pageB), { timeout: 30_000, intervals: [3_000] })
        .toBe('18,8');

      // Each roster entry carries the other pilot's sector.
      await expect(pageA.locator('[data-testid="player-list-panel"]')).toContainText(shipB);

      // A local scan from A must paint a ship cell for B (planet/self cells are
      // separate testids, so this is specifically another ship).
      //
      // Re-scan inside the poll: the map only repaints when a scan.render event
      // arrives, so polling the cell count without issuing a fresh scan can
      // never converge. Re-teleport B alongside A too — neither ship is
      // guaranteed to be at rest, and drift separates them over physics ticks.
      await expect
        .poll(async () => {
          await outfitShip(request, { shipname: shipB, x: MEETING_POINT.x + 0.4, y: MEETING_POINT.y });
          await sendCommand(pageA, 'sca lo');
          return pageA.locator('[data-testid^="cell-ship-"]').count();
        }, { timeout: 45_000, intervals: [3_000] })
        .toBeGreaterThan(0);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('one pilot firing is visible to the other as an incoming hit', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      const shipA = uniqueShipName('FireA');
      const shipB = uniqueShipName('FireB');

      await startNewPilot(pageA, shipA);
      await startNewPilot(pageB, shipB);

      // A sits just west of B, facing east, shields down so the hull takes it.
      await outfitShip(request, { shipname: shipA, x: MEETING_POINT.x, y: MEETING_POINT.y, damage: 0 });
      await outfitShip(request, {
        shipname: shipB,
        x: MEETING_POINT.x + 0.03,
        y: MEETING_POINT.y,
        damage: 0,
        shieldstat: 'down',
        shield: 0,
      });

      // Turn A to face B (due east) and wait for the heading to settle.
      await sendCommand(pageA, 'imp 0 90');
      await expect
        .poll(async () => {
          await sendCommand(pageA, 'rep nav');
          const text = await pageA.locator(LOG).innerText();
          const m = [...text.matchAll(/Heading: (\d+) degrees/g)];
          return m.length ? Number(m[m.length - 1][1]) : -1;
        }, { timeout: 45_000, intervals: [3_000] })
        .toBe(90);

      await sendCommand(pageA, 'pha 0 0');

      // The victim's client must render the incoming hit — this is the
      // cross-client combat broadcast, not just A's local echo.
      await expect(pageB.locator(LOG)).toContainText(/INCOMING PHASER/i, { timeout: 30_000 });
      await expect(pageA.locator(LOG)).toContainText(
        new RegExp(`Phaser hit on ${shipB}`, 'i'),
      );
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
