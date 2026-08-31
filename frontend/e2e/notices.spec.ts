import { test, expect } from '@playwright/test';
import { LOG, INPUT, startNewPilot, sendCommand, uniqueShipName, outfitShip, reconnect, steerTo } from './helpers';

/**
 * Unsolicited server notices — the ones that arrive without the player typing
 * anything.
 *
 * A whole family of them funnels through the `event.log` socket event (the
 * self-destruct countdown, cloak collapse, subsystem damage, the call-for-help
 * alert when your planet is attacked, the sector notice when a captain abandons
 * ship) and radio traffic arrives on `message.send`. The client listened for
 * neither, so all of it was dropped on the floor — `des` started a countdown
 * the pilot never saw and `sen` transmitted into a void. Every backend test
 * passed throughout, because the gateway was emitting correctly the whole time.
 */

/** Clear of the neutral zone and of the Cybertron patrol lanes near the core. */
const QUIET = { x: 26.5, y: 12.5 };

test.describe('unsolicited server notices reach the pilot', () => {
  test('the self-destruct sequence is announced to the sector', async ({ page, request }) => {
    const ship = uniqueShipName('boom');
    await startNewPilot(page, ship);
    // Self-destruct is refused inside the neutral zone, so move out first.
    await outfitShip(request, { shipname: ship, x: QUIET.x, y: QUIET.y });
    await reconnect(page);
    await expect(page.locator(INPUT)).toBeVisible();

    await sendCommand(page, 'des');

    // The command's own reply, then the sector-wide notice on `event.log`.
    await expect(page.locator(LOG)).toContainText('Self-destruct sequence initiated');
    await expect(page.locator(LOG)).toContainText(`${ship} has initiated self-destruct`);

    await sendCommand(page, 'abo');
    await expect(page.locator(LOG)).toContainText('aborted');
  });

  test('crossing a sector boundary tells the pilot, and not about themselves', async ({ page, request }) => {
    // Turning is 20 degrees a tick, so squaring up before the run takes time.
    test.setTimeout(180_000);
    const ship = uniqueShipName('cross');
    await startNewPilot(page, ship);

    // Parked just inside sector (22,5), a fraction from the (22,4) line.
    // Heading 0 decreases y, so impulse walks the ship across it.
    await outfitShip(request, { shipname: ship, x: 22.5, y: 5.004 });
    await reconnect(page);
    await expect(page.locator(INPUT)).toBeVisible();

    // Point north first — heading 0 is y-decreasing, and pilots now spawn on a
    // random heading, so the direction of travel cannot be assumed.
    await steerTo(page, 0);
    await sendCommand(page, 'imp 9');
    // GEFUNCS.C:711 MOVE1 — the mover's own notice, naming both sectors.
    await expect(page.locator(LOG)).toContainText('You have moved from sector (22, 5) to (22, 4).', {
      timeout: 40_000,
    });
    // GEFUNCS.C:717,722 exclude `usrn` from the sector notices: the pilot must
    // not be told about their own arrival. Their socket joins the destination
    // room just before the broadcast, so without the exclusion they were.
    await expect(page.locator(LOG)).not.toContainText(`${ship} has entered the sector`);

    await sendCommand(page, 'imp 0');
  });

  test('radio: a transmission reaches a pilot tuned to the same frequency', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const shipA = uniqueShipName('radA');
    const shipB = uniqueShipName('radB');

    try {
      await startNewPilot(pageA, shipA);
      await startNewPilot(pageB, shipB);

      // Both pilots spawn in the neutral zone, so they share a sector room.
      // 1..19999 is the sector-scoped band (>=20000 is galaxy-wide).
      await sendCommand(pageA, 'fre a 1234');
      await sendCommand(pageB, 'fre a 1234');

      await sendCommand(pageA, 'sen a rendezvous at zygor');
      await expect(pageB.locator(LOG)).toContainText('rendezvous at zygor');
      await expect(pageB.locator(LOG)).toContainText(shipA);
      await expect(pageB.locator(LOG)).toContainText('[A]');

      // C excludes the sender from their own transmission and confirms instead,
      // naming the frequency it went out on.
      await expect(pageA.locator(LOG)).toContainText('frequency 1234');
      await expect(pageA.locator(LOG)).not.toContainText(`${shipA}: rendezvous`);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('radio: retuning takes a pilot off the channel', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const shipA = uniqueShipName('offA');
    const shipB = uniqueShipName('offB');

    try {
      await startNewPilot(pageA, shipA);
      await startNewPilot(pageB, shipB);

      await sendCommand(pageA, 'fre a 1234');
      await sendCommand(pageB, 'fre a 4321');

      await sendCommand(pageA, 'sen a this is a private channel');
      // outsect/outwar deliver only to ships carrying the sender's frequency
      // (GEMAIN.C:2583). The port used to broadcast to the whole sector room, so
      // `fre` bought the player nothing and every channel was public.
      await sendCommand(pageB, 'rep nav');
      await expect(pageB.locator(LOG)).not.toContainText('this is a private channel');

      // Tuning in makes the next transmission audible — proves the silence above
      // was the frequency filter and not a broken pipe.
      await sendCommand(pageB, 'fre a 1234');
      await sendCommand(pageA, 'sen a now you hear me');
      await expect(pageB.locator(LOG)).toContainText('now you hear me');
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
