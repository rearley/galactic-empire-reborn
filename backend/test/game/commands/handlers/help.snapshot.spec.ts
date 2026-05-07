/**
 * T022 — Snapshot tests for help topic body content.
 * Pins the exact line content of each topic body so future wording
 * edits are deliberate (the snapshot must be updated explicitly).
 *
 * @see specs/016-navigation-spy/
 */
import { HELP_TOPICS, HELP_TOPIC_IDS } from '../../../../src/game/commands/help/help-topics';

describe('Help topic snapshots', () => {
  it('HELP_TOPIC_IDS contains exactly the five expected topics in order', () => {
    expect(HELP_TOPIC_IDS).toEqual(['navigation', 'combat', 'trade', 'planet', 'ship']);
  });

  it('navigation topic body matches snapshot', () => {
    expect(HELP_TOPICS.navigation.body).toMatchSnapshot();
  });

  it('combat topic body matches snapshot', () => {
    expect(HELP_TOPICS.combat.body).toMatchSnapshot();
  });

  it('trade topic body matches snapshot', () => {
    expect(HELP_TOPICS.trade.body).toMatchSnapshot();
  });

  it('planet topic body matches snapshot', () => {
    expect(HELP_TOPICS.planet.body).toMatchSnapshot();
  });

  it('ship topic body matches snapshot', () => {
    expect(HELP_TOPICS.ship.body).toMatchSnapshot();
  });

  // Full catalog snapshot for belt-and-suspenders coverage
  it('full HELP_TOPICS catalog matches snapshot', () => {
    expect(HELP_TOPICS).toMatchSnapshot();
  });
});
