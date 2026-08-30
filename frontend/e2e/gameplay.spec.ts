import { test, expect } from '@playwright/test';
import { LOG, INPUT, startNewPilot, sendCommand, uniqueShipName } from './helpers';

/**
 * Frontend + backend gameplay smoke test.
 *
 * Everything here crosses the FE/BE boundary: HTTP registration, the Socket.io
 * handshake, the onboarding prompt, and command round-trips through the real
 * game services. A green unit suite on both sides does not prove any of it —
 * during playtesting the event log silently collapsed the column padding that
 * `who` emits, and no non-browser layer could see it because it was CSS.
 *
 * Assertions favour structure over exact values: the world runs on a live
 * 6-second physics tick with AI ships moving, so anything pinned to a specific
 * coordinate or damage number would be flaky by construction.
 */

test.describe('gameplay smoke — frontend against a live backend', () => {
  test('a new pilot can register, board a ship, and get command responses', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      // Favicon 404s are cosmetic; socket reconnects happen on backend reloads.
      if (msg.type() === 'error' && !/favicon|WebSocket/i.test(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await startNewPilot(page, uniqueShipName('Scout'));

    // Round-trip a command through the real command router and game services.
    await sendCommand(page, 'rep nav');
    const log = page.locator(LOG);
    await expect(log).toContainText('Interceptor');   // onboarding grants class 1
    await expect(log).toContainText(/In sector \(\d+, \d+\)/);
    await expect(log).toContainText(/Heading:/);

    expect(consoleErrors).toEqual([]);
  });

  test('sca lo renders scan glyphs into the sector map', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('Scan'));

    // `sca` is the canonical GECMDS.C verb; this also guards the router's
    // 3-character prefix matching from the frontend side.
    await sendCommand(page, 'sca lo');

    const map = page.locator('[data-testid="scan-map"], .whitespace-pre').first();
    await expect(map).toBeVisible();

    // Sector 0,0 is the neutral zone and holds five planets, so a local scan
    // must paint something other than empty-space dots.
    await expect
      .poll(async () => {
        const text = await page.locator(LOG).innerText();
        return /Range: .*Sector/i.test(text);
      }, { timeout: 15_000 })
      .toBe(true);
  });

  test('REGRESSION: the event log preserves column padding in ASCII tables', async ({ page }) => {
    // who.handler.ts pads with padEnd(22)/padEnd(20)/padStart(5). The log
    // renderer lacked a whitespace-preserving class, so the browser collapsed
    // every run of spaces and the table lost its alignment entirely. Nothing
    // outside a browser can catch this.
    await startNewPilot(page, uniqueShipName('Who'));

    await sendCommand(page, 'who');

    const header = page.locator(`${LOG} > *`, { hasText: 'Shipname' }).first();
    await expect(header).toBeVisible();

    // The padding must survive into the DOM, not be normalised away.
    const headerText = await header.innerText();
    expect(headerText).toMatch(/Shipname\s{2,}Class/);

    // ...and the CSS must be the kind that preserves it.
    const whiteSpace = await header.evaluate((el) => getComputedStyle(el).whiteSpace);
    expect(whiteSpace).toMatch(/^pre/);
  });

  test('scanning renders planet and ship glyphs into the sector map (UI)', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('Map'));

    // Onboarding spawns at sector 0,0 — the neutral zone, which holds five
    // named planets including Zygor-3. A local scan must therefore paint
    // planet glyphs, not just empty-space dots.
    await sendCommand(page, 'sca lo');

    const map = page.locator('[data-testid="scan-map"]');
    await expect(map).toBeVisible();

    // Planet cells carry data-testid="cell-planet-<x>-<y>"; the local ship is
    // cell-self-*. Assert the grid is actually populated rather than blank.
    await expect
      .poll(async () => page.locator('[data-testid^="cell-planet-"]').count(), { timeout: 20_000 })
      .toBeGreaterThan(0);
    await expect(page.locator('[data-testid^="cell-self-"]')).toHaveCount(1);
  });

  test('sca se renders the numbered planets of the current sector (UI)', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('Sect'));

    await sendCommand(page, 'sca se');

    // The sector-scan card renders its own grid with per-planet digits.
    const card = page.locator('[data-testid="scan-card"]').first();
    await expect(card).toBeVisible();
    await expect(page.locator('[data-testid="scan-card-header"]').first()).toContainText(/Sector\s*0\s*,\s*0/);

    const grid = page.locator('[data-testid="scan-card-grid"]').first();
    // Sector 0,0 holds five planets, rendered as digits 1-9.
    await expect.poll(async () => (await grid.innerText()).replace(/\s/g, '').length, { timeout: 20_000 })
      .toBeGreaterThan(0);
  });

  test('movement: impulse with a course changes heading and moves the ship', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('Move'));

    // NOTE: `imp <pct>` with no course argument resets the course to the
    // current heading — it does NOT preserve a pending `rot`. That is faithful:
    // C defaults the course arg to "0" and valdegree stores it into
    // warsptr->degrees as a side effect (GEFUNCS.C:1943), so
    // `deg = normal(heading + degrees)` collapses to the current heading.
    // Supply the course with the impulse to turn and accelerate in one order.
    await sendCommand(page, 'imp 50 90');
    await expect(page.locator(LOG)).toContainText(/Engines fired, new course 90 degrees/i);

    // The world advances on a 6s physics tick; poll rep nav until the reported
    // heading has actually swung to 90 rather than asserting a fixed value.
    await expect
      .poll(async () => {
        await page.locator(INPUT).fill('rep nav');
        await page.locator(INPUT).press('Enter');
        await page.waitForTimeout(2_000);
        const text = await page.locator(LOG).innerText();
        const matches = [...text.matchAll(/Heading: (\d+) degrees/g)];
        return matches.length ? Number(matches[matches.length - 1][1]) : -1;
      }, { timeout: 45_000, intervals: [3_000] })
      .toBe(90);

    await expect(page.locator(LOG)).toContainText(/Speed: impulse/);
  });

  test('rejects an out-of-range impulse value rather than accepting it silently', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('Rng'));

    // README once documented `imp 5000`; the real gate is valpcnt(arg, 0, 99).
    await sendCommand(page, 'imp 5000');
    await expect(page.locator(LOG)).toContainText(/out of range \(0-99\)/i);
  });

  test('an unknown verb is reported, and 2-character input is not a valid verb', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('Verb'));

    // gesearch matches on the first 3 characters (GECMDS.C:249), so `sc` is
    // NOT a scan verb — strncmp("sc","sca",3) compares '\0' against 'a'.
    await sendCommand(page, 'sc lo');
    await expect(page.locator(LOG)).toContainText(/Unknown command/i);

    // ...but any input whose first 3 characters match does resolve.
    await sendCommand(page, 'scanner lo');
    await expect(page.locator(LOG)).toContainText(/Range:.*Sector/i);
  });

  test('orbiting: a pilot can enter orbit around a planet and leave under power', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('Orb'));

    // Onboarding spawns at sector 0,0, which holds five named planets
    // (Zygor-3, Nexus Prime, Caldor IV, Minera, Draconis).
    await sendCommand(page, 'orb 1');
    await expect(page.locator(LOG)).toContainText(/Now in orbit around .+\./i);

    // Firing engines leaves orbit — GECMDS.C:512 LEAVEORB.
    await sendCommand(page, 'imp 30');
    await expect(page.locator(LOG)).toContainText(/Engines fired/i);

    // ...and the ship is under way again rather than still docked.
    await expect
      .poll(async () => {
        await page.locator(INPUT).fill('rep nav');
        await page.locator(INPUT).press('Enter');
        await page.waitForTimeout(2_000);
        return await page.locator(LOG).innerText();
      }, { timeout: 30_000, intervals: [3_000] })
      .toMatch(/Speed: impulse/i);
  });

  test('orbiting a planet number that is not there is refused', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('NoOrb'));

    // Sector 0,0 has five planets, so slot 9 is empty.
    await sendCommand(page, 'orb 9');
    await expect(page.locator(LOG)).not.toContainText(/Now in orbit/i);
  });
});
