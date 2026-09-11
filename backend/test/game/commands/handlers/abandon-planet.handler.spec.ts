import { AbandonHandlerService } from '../../../../src/game/commands/handlers/abandon.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { SHIP_STATUS_ABANDONED } from '../../../../src/game/commands/_ship-management-constants';
import { makeShip as baseMakeShip } from '../../../helpers/make-ship';

/**
 * `aba` is C's colony-abandonment command (GECMDS.C:3420): in orbit over a
 * planet you own, it releases the planet. This port had reinterpreted the
 * keyword as abandon-*ship* (research D2), deferring colony abandonment to the
 * planet feature where it was never picked up — so a player had no way to give
 * up a planet at all, and a mistyped `abo` scuttled their hull instead.
 *
 * Bare `aba` is now the canonical planet command; the port's ship path moved
 * behind the explicit `aba ship`.
 */
function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'owner1',
    shipname: 'Ranger',
    xcoord: 4.5,
    ycoord: 2.5,
    energy: 10000,
    where: 11, // orbiting planet 1 in sector (4,2)
    items: Array(14).fill(0n) as bigint[],
    ...overrides,
  });
}

function makeHandler(
  abandonPlanetResult: unknown = { ok: true, name: 'Aurora' },
): { handler: AbandonHandlerService; abandonPlanet: jest.Mock; abandonShip: jest.Mock; ship: ShipState } {
  const ship = makeShip();
  const abandonShip = jest.fn().mockImplementation(() => {
    ship.status = SHIP_STATUS_ABANDONED;
    return Promise.resolve();
  });
  const abandonPlanet = jest.fn().mockResolvedValue(abandonPlanetResult);
  const handler = new AbandonHandlerService(
    { abandon: abandonShip } as unknown as ShipStateService,
    { abandonPlanet } as unknown as PlanetStateService,
  );
  return { handler, abandonPlanet, abandonShip, ship };
}

describe('AbandonHandlerService — canonical `aba` releases the planet', () => {
  it('abandons the orbited planet and names it back', async () => {
    const { handler, abandonPlanet, ship } = makeHandler();
    const result = await handler.command.handler(ship, ['yes'], {});
    expect(abandonPlanet).toHaveBeenCalledWith(4, 2, 1, 'owner1');
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABAN02, 'Aurora'));
    expect(result.lines[0].category).toBe('success');
  });

  it('never touches the ship', async () => {
    const { handler, abandonShip, ship } = makeHandler();
    await handler.command.handler(ship, ['yes'], {});
    expect(abandonShip).not.toHaveBeenCalled();
    expect(ship.status).toBe(1);
  });

  it('refuses when not in orbit (ABAN01)', async () => {
    const { handler, abandonPlanet } = makeHandler();
    const result = await handler.command.handler(makeShip({ where: 0 }), ['yes'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABAN01));
    expect(abandonPlanet).not.toHaveBeenCalled();
  });

  it("refuses a planet that is not the caller's (ABAN03)", async () => {
    const { handler, ship } = makeHandler({ ok: false, reason: 'NOT_OWNER' });
    const result = await handler.command.handler(ship, ['yes'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABAN03));
  });

  it('reports a missing planet as ABAN03 rather than claiming success', async () => {
    const { handler, ship } = makeHandler({ ok: false, reason: 'NOT_FOUND' });
    const result = await handler.command.handler(ship, ['yes'], {});
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABAN03));
  });

  it('does not ask the gateway for ship re-entry', async () => {
    const { handler, ship } = makeHandler();
    const result = await handler.command.handler(ship, ['yes'], {});
    expect(result.reenterShipEntry).toBeUndefined();
  });
});

describe('AbandonHandlerService — `aba ship` keeps the port\'s scuttle path', () => {
  it('abandons the hull and asks for ship re-entry', async () => {
    const { handler, abandonShip, abandonPlanet, ship } = makeHandler();
    const result = await handler.command.handler(ship, ['ship', 'yes'], {});
    expect(abandonShip).toHaveBeenCalledWith('owner1', 1);
    expect(abandonPlanet).not.toHaveBeenCalled();
    expect(result.reenterShipEntry).toBe(true);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABANDON_OK, 'Ranger'));
  });

  it('accepts the word in any case', async () => {
    const { handler, abandonShip, ship } = makeHandler();
    await handler.command.handler(ship, ['SHIP', 'yes'], {});
    expect(abandonShip).toHaveBeenCalled();
  });

  /**
   * Anything that is not `ship` and not a confirmation is a refusal. The word
   * arrives as the answer to "Type YES to confirm", routed back through the
   * gateway's followup as `aba <whatever they typed>` — so treating an
   * unrecognised word as "go ahead" would defeat the prompt entirely.
   */
  it('treats an unrecognised answer as a refusal, not as consent', async () => {
    const { handler, abandonPlanet, abandonShip, ship } = makeHandler();
    const result = await handler.command.handler(ship, ['planet'], {}) as { lines: { text: string }[] };
    expect(abandonPlanet).not.toHaveBeenCalled();
    expect(abandonShip).not.toHaveBeenCalled();
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABAN_CANCELLED));
  });
});

/**
 * Losing a colony built over days should take more than three keystrokes,
 * especially with `abo` (abort self-destruct) one letter away in the same
 * command set. C's cmd_abandon releases it on the spot; this is a deliberate
 * deviation. @see docs/DECISIONS.md
 */
describe('AbandonHandlerService — confirmation', () => {
  function withPlanet(name = 'Aurelia-Landing', owner = 'owner1') {
    const ship = makeShip();
    const abandonPlanet = jest.fn().mockResolvedValue({ ok: true, name });
    const handler = new AbandonHandlerService(
      { abandon: jest.fn() } as unknown as ShipStateService,
      {
        abandonPlanet,
        get: jest.fn().mockReturnValue({ name, userid: owner }),
      } as unknown as PlanetStateService,
    );
    return { handler, abandonPlanet, ship };
  }

  it('names the planet it is about to give up, and gives it up to nobody yet', async () => {
    const { handler, abandonPlanet, ship } = withPlanet();
    const result = await handler.command.handler(ship, [], {}) as {
      lines: { text: string }[]; expectFollowup?: string;
    };
    expect(abandonPlanet).not.toHaveBeenCalled();
    expect(result.lines[0].text).toContain('Aurelia-Landing');
    expect(result.expectFollowup).toBe('aba');
  });

  it('releases the planet once confirmed', async () => {
    const { handler, abandonPlanet, ship } = withPlanet();
    await handler.command.handler(ship, ['yes'], {});
    expect(abandonPlanet).toHaveBeenCalled();
  });

  it('does not prompt for a planet the captain does not own', async () => {
    const { handler, abandonPlanet, ship } = withPlanet('Someone Elses', 'other-captain');
    const result = await handler.command.handler(ship, [], {}) as {
      lines: { text: string }[]; expectFollowup?: string;
    };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABAN03));
    expect(result.expectFollowup).toBeUndefined();
    expect(abandonPlanet).not.toHaveBeenCalled();
  });

  it('does not prompt when not in orbit', async () => {
    const { handler, ship } = withPlanet();
    const result = await handler.command.handler(makeShip({ where: 0 }), [], {}) as {
      lines: { text: string }[]; expectFollowup?: string;
    };
    void ship;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABAN01));
    expect(result.expectFollowup).toBeUndefined();
  });

  it('asks before scuttling the hull too', async () => {
    const { handler, ship } = withPlanet();
    const result = await handler.command.handler(ship, ['ship'], {}) as {
      lines: { text: string }[]; expectFollowup?: string;
    };
    expect(result.lines[0].text).toContain('Ranger');
    expect(result.expectFollowup).toBe('aba ship');
  });

  /**
   * Answering the scuttle prompt with anything but YES must END it.
   *
   * The first cut re-prompted on any non-confirmation, and because the prompt
   * re-arms `expectFollowup`, the gateway fed the NEXT command back in as
   * another answer. Saying "no" therefore trapped the session: every command
   * the captain typed came back as the same question. Found by answering "no"
   * in a live game — the unit tests only ever covered `ship` and `ship yes`.
   */
  it('ends the scuttle prompt when the answer is not yes', async () => {
    const { handler, ship } = withPlanet();
    const abandonShip = jest.fn();
    const h = new AbandonHandlerService(
      { abandon: abandonShip } as unknown as ShipStateService,
      { abandonPlanet: jest.fn(), get: jest.fn() } as unknown as PlanetStateService,
    );
    void handler;

    const result = await h.command.handler(ship, ['ship', 'no'], {}) as {
      lines: { text: string }[]; expectFollowup?: string;
    };

    expect(abandonShip).not.toHaveBeenCalled();
    expect(result.lines[0].text).toBe(formatMessage(MessageId.ABAN_CANCELLED));
    // Critically: does NOT re-arm the followup, or the next command is eaten.
    expect(result.expectFollowup).toBeUndefined();
  });
});
