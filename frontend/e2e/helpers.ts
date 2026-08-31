import { expect, type Page, type APIRequestContext } from '@playwright/test';

/** Backend origin — the Vite dev server proxies to this, debug endpoints do not. */
export const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:3000';

export const LOG = '[data-testid="event-log"]';
export const INPUT = '[data-testid="command-input"]';

/**
 * Unique per run — accounts AND ship names persist in the dev database, and
 * `Ship_shipname_lower_idx` is a UNIQUE index on LOWER(shipname). Reusing a
 * fixed ship name makes the second run fail with an empty event log.
 */
export function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/** Ship names are capped at 19 characters by the onboarding prompt. */
export function uniqueShipName(prefix: string): string {
  return `${prefix}${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 100)}`.slice(0, 19);
}

/** Register a fresh pilot and complete onboarding, leaving the terminal ready. */
export async function startNewPilot(page: Page, shipName: string): Promise<void> {
  await page.goto('/');

  // AuthScreen opens in login mode; the first /register/i control is the switch.
  await page.getByRole('button', { name: /register/i }).click();
  await page.getByLabel(/username/i).fill(uniqueName('e2e'));
  await page.getByLabel(/password/i).fill('E2ePass123!');
  await page.getByRole('button', { name: /^register$/i }).click();

  const prompt = page.getByText(/enter a name for your ship/i);
  await expect(prompt).toBeVisible();
  await page.locator('input[type="text"]').fill(shipName);
  await page.locator('input[type="text"]').press('Enter');

  await expect(page.locator(LOG)).toContainText(`Welcome aboard, ${shipName}.`);
  await expect(page.locator(INPUT)).toBeVisible();
}

/** Send a command and wait for the log to grow. */
export async function sendCommand(page: Page, command: string): Promise<void> {
  const before = await page.locator(`${LOG} > *`).count();
  await page.locator(INPUT).fill(command);
  await page.locator(INPUT).press('Enter');
  await expect
    .poll(async () => page.locator(`${LOG} > *`).count(), { timeout: 15_000 })
    .toBeGreaterThan(before);
}

/**
 * Dev-only outfit endpoint: ordnance, hull damage, class, shields, position.
 * Ship state lives in ShipStateService's in-memory map, so this is the only way
 * to stage an engagement — a SQL write would be overwritten by the next flush.
 */
export async function outfitShip(
  request: APIRequestContext,
  params: Record<string, string | number>,
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const res = await request.post(`${BACKEND}/debug/ship/outfit?${qs}`);
  expect(res.ok(), `outfit failed: ${await res.text()}`).toBe(true);
  return (await res.json()) as Record<string, unknown>;
}

/** Dev-only droid spawn. `stationary` keeps the target from drifting out of lock. */
export async function spawnDroid(
  request: APIRequestContext,
  params: { class: number; x: number; y: number; stationary?: boolean; name?: string },
): Promise<{ shipname: string; userid: string }> {
  const qs = new URLSearchParams({
    class: String(params.class),
    x: String(params.x),
    y: String(params.y),
    ...(params.stationary ? { stationary: 'true' } : {}),
    ...(params.name ? { name: params.name } : {}),
  }).toString();
  const res = await request.post(`${BACKEND}/debug/droid/spawn?${qs}`);
  expect(res.ok(), `spawn failed: ${await res.text()}`).toBe(true);
  return (await res.json()) as { shipname: string; userid: string };
}

/** Dev-only: set the owning captain's credit balance. */
export async function grantCredits(
  request: APIRequestContext,
  shipname: string,
  amount: number,
): Promise<void> {
  const qs = new URLSearchParams({ shipname, amount: String(amount) }).toString();
  const res = await request.post(`${BACKEND}/debug/ship/credits?${qs}`);
  expect(res.ok(), `credits failed: ${await res.text()}`).toBe(true);
}

/**
 * Reconnect so the socket re-boards and re-joins the sector room for the ship's
 * CURRENT position. `outfitShip`'s teleport moves the ship in the state map but
 * not the socket between Socket.io rooms, so sector-scoped broadcasts keep going
 * to the sector the pilot boarded in until they reconnect or fly across a
 * boundary under power.
 */
export async function reconnect(page: Page): Promise<void> {
  await page.goto('/');
}
