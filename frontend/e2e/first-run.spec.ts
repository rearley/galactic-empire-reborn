import { test, expect } from '@playwright/test';
import { LOG, INPUT, startNewPilot, sendCommand, uniqueShipName } from './helpers';

/**
 * The first ten minutes, exactly as a new player meets them.
 *
 * Everything here was found by actually playing a fresh pilot rather than by
 * reading code: the whole first-run output used to be one line with no pointer
 * to `hel`; `hel trade` documented `buy <item> <qty>` when the command wants the
 * quantity first; the purchase confirmation printed the UNIT price in the "for N
 * credits" slot, so "100 Men purchased for 4 credits" while 400 left the
 * account; `nav` called itself an autopilot but never set speed; `sca pl`
 * reported "Bearing: 0" for every planet; and `rep acc` said "Planets: none."
 * to a pilot who had just claimed one.
 */
test.describe('a new pilot can find their feet', () => {
  test('the first thing a pilot sees points them at the help', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('first'));

    await expect(page.locator(LOG)).toContainText('neutral zone');
    await expect(page.locator(LOG)).toContainText("'hel'");
  });

  test('the trade help matches what the trade commands accept', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('doc'));
    await sendCommand(page, 'orb 1');

    await sendCommand(page, 'hel trade');
    await expect(page.locator(LOG)).toContainText('buy <qty> <item>');

    // Typing what the help says must work.
    await sendCommand(page, 'buy 10 foo');
    await expect(page.locator(LOG)).toContainText(/10 Food Cases purchased/i);
  });

  test('a purchase reports what it actually cost', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('cost'));
    await sendCommand(page, 'orb 1');

    await sendCommand(page, 'rep acc');
    const before = Number(
      /Credits:\s*([\d,]+)/.exec(await page.locator(LOG).innerText())?.[1].replace(/,/g, '') ?? '0',
    );

    // 100 men at 4 cr each is 400 credits, not 4.
    await sendCommand(page, 'buy 100 men');
    const line = /100 Men purchased at (\d+) cr each — (\d+) credits\./.exec(
      await page.locator(LOG).innerText(),
    );
    expect(line, 'purchase confirmation should name unit price and total').not.toBeNull();
    const [, unit, total] = line!;
    expect(Number(total)).toBe(Number(unit) * 100);

    await sendCommand(page, 'rep acc');
    const after = Number(
      /Credits:\s*([\d,]+)/.exec(
        (await page.locator(LOG).innerText()).split('Account:').pop() ?? '',
      )?.[1].replace(/,/g, '') ?? '0',
    );
    expect(before - after).toBe(Number(total));
  });

  test('nav gives a course and says speed is still the pilot\'s job', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('navi'));

    await sendCommand(page, 'nav 1 0');
    await expect(page.locator(LOG)).toContainText(/Course set for \(1,0\)/);
    await expect(page.locator(LOG)).toContainText(/Set speed/i);
    await expect(page.locator(LOG)).not.toContainText(/autopilot/i);

    // Breaking orbit for a course must not park a stopped ship in the warp state.
    await sendCommand(page, 'orb 1');
    await sendCommand(page, 'nav 2 0');
    await sendCommand(page, 'rep nav');
    await expect(page.locator(LOG)).not.toContainText(/hyperspace/i);
  });

  test('a planet survey gives a bearing you can steer by', async ({ page }) => {
    await startNewPilot(page, uniqueShipName('surv'));

    // The neutral-zone hub has five planets in different directions; if the
    // bearing were still hard-coded they would all read 0.
    await sendCommand(page, 'sca pl 2');
    await sendCommand(page, 'sca pl 3');
    const text = await page.locator(LOG).innerText();
    const bearings = [...text.matchAll(/Bearing:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(bearings.length).toBeGreaterThanOrEqual(2);
    expect(new Set(bearings).size).toBeGreaterThan(1);
  });

});
