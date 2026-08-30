import { test, expect } from '@playwright/test';
import { LOG, INPUT, startNewPilot, sendCommand, uniqueShipName, outfitShip, spawnDroid } from './helpers';

/**
 * Combat through the real UI against the real backend.
 *
 * Combat could not be exercised by hand at all until the dev endpoints existed:
 * clearing the neutral zone by flying takes minutes of warp, and a Cybertron
 * destroyed the test ship on three consecutive attempts. These tests stage the
 * engagement directly — outfit, teleport, spawn a named stationary target —
 * then drive the fight from the browser and assert what the player sees.
 *
 * Every defect this suite guards was found by playing: torpedoes one-shotting
 * everything (TDAMMAX above its numopt ceiling), shields granting total
 * immunity, and a mine whose blast covered the whole galaxy.
 */

/**
 * Quiet corners of the grid, well clear of the neutral zone at sector 0,0.
 * Each test uses its OWN arena: droids persist for a while, so a shared arena
 * accumulates targets and name-based targeting can pick a leftover.
 */
const ARENAS = {
  phaser: { x: 24.5, y: 11.5 },
  torpedo: { x: 21.5, y: 6.5 },
  clamp: { x: 27.5, y: 3.5 },
};

/** Poll `rep nav` until the reported heading settles on `want`. */
async function waitForHeading(page: import('@playwright/test').Page, want: number): Promise<void> {
  await expect
    .poll(async () => {
      await page.locator(INPUT).fill('rep nav');
      await page.locator(INPUT).press('Enter');
      await page.waitForTimeout(2_000);
      const text = await page.locator(LOG).innerText();
      const m = [...text.matchAll(/Heading: (\d+) degrees/g)];
      return m.length ? Number(m[m.length - 1][1]) : -1;
    }, { timeout: 45_000, intervals: [3_000] })
    .toBe(want);
}

test.describe('combat — real UI, real backend', () => {
  test('phaser fire produces a hit with hull damage in the event log', async ({ page, request }) => {
    const ship = uniqueShipName('Gun');
    await startNewPilot(page, ship);

    // Firing inside the neutral zone self-zaps for SE100DAM (instant death), so
    // the ship must be moved out before any weapon test.
    const arena = ARENAS.phaser;
    await outfitShip(request, { shipname: ship, damage: 0, x: arena.x, y: arena.y });
    const targetName = uniqueShipName('Tgt');
    await spawnDroid(request, { class: 31, x: arena.x + 0.03, y: arena.y, stationary: true, name: targetName });

    // The target sits due east; phasers fire along the ship's heading.
    await sendCommand(page, 'imp 0 90');
    await waitForHeading(page, 90);

    await sendCommand(page, 'pha 0 0');

    // The firer's own line is "Phaser hit on <name>: shield -N, hull -N."
    // (the broadcast form "X hits Y (phaser, hull -N%)" is a separate event).
    await expect(page.locator(LOG)).toContainText(/Phaser hit on .*: shield -\d+, hull -\d+/i);
  });

  test('torpedoes are refused without a lock, and launch once locked', async ({ page, request }) => {
    const ship = uniqueShipName('Torp');
    await startNewPilot(page, ship);

    const arena = ARENAS.torpedo;
    await outfitShip(request, { shipname: ship, torps: 10, damage: 0, x: arena.x, y: arena.y });

    // Firing without a lock must be refused rather than silently doing nothing.
    await sendCommand(page, 'tor @');
    await expect(page.locator(LOG)).toContainText(/lock/i);

    const targetName = uniqueShipName('Tgt');
    await spawnDroid(request, { class: 32, x: arena.x, y: arena.y, stationary: true, name: targetName });

    // The droid AI re-randomises speed2b every tick (droid-tick.service.ts), so
    // `stationary` governs only the spawn — the target starts wandering and the
    // lock-quality gate degrades with distance and speed
    // (`fact = (1.2 - speed/5000) * ((5 - dist) / TORFACT)`, GECMDS.C:1378).
    // Re-teleport alongside the target immediately before each attempt.
    await expect
      .poll(async () => {
        await outfitShip(request, { shipname: ship, x: arena.x + 0.01, y: arena.y });
        await sendCommand(page, `loc ${targetName}`);
        await sendCommand(page, 'tor @');
        return /Torpedo away/i.test(await page.locator(LOG).innerText());
      }, { timeout: 60_000, intervals: [2_000] })
      .toBe(true);
  });

  /**
   * NOT tested here: the torpedo's landed damage value.
   *
   * Landing a torpedo in the live world depends on travel time across physics
   * ticks, a wandering target, the lock-quality gate and a decoy-intercept roll
   * — probabilistic enough that an E2E assertion on it is flaky by
   * construction. The TDAMMAX clamp it would verify is already covered
   * deterministically by test/balance/projectile-dammax.balance.spec.ts, and was
   * confirmed by hand in a playtest (hull -78% where the pre-clamp value was an
   * outright kill). E2E's job here is the wiring: lock gating and launch, both
   * asserted above.
   */

  test('firing inside the neutral zone self-zaps the firer', async ({ page }) => {
    // GECMDS.C:937 zaphim — SE100DAM (101) hull damage, an instant kill.
    // Onboarding spawns at sector 0,0, so no setup is needed.
    await startNewPilot(page, uniqueShipName('Zap'));

    await sendCommand(page, 'pha 0 0');

    await expect
      .poll(async () => (await page.locator(LOG).innerText()), { timeout: 30_000, intervals: [2_000] })
      .toMatch(/neutral|zap|destroyed/i);
  });
});
