/**
 * T022 — Snapshot tests for help topic body content.
 * Pins the exact line content of each topic body so future wording
 * edits are deliberate (the snapshot must be updated explicitly).
 *
 * @see specs/016-navigation-spy/
 */
import { HELP_TOPICS, HELP_TOPIC_IDS } from '../../../../src/game/commands/help/help-topics';

describe('Help topic snapshots', () => {
  it('HELP_TOPIC_IDS contains exactly the expected topics in order', () => {
    expect(HELP_TOPIC_IDS).toEqual([
      'navigation',
      'combat',
      'trade',
      'planet',
      'ship',
      // 'mai' is cmd_maint in the original table (GECMDS.C:144) and repair was
      // undiscoverable from `hel`; these two topics close that gap.
      'maintenance',
      'mail',
      'comms',
    ]);
  });

  it('navigation topic body matches snapshot', () => {
    expect(HELP_TOPICS.navigation.body).toMatchSnapshot();
  });

  it('comms topic body matches snapshot', () => {
    expect(HELP_TOPICS.comms.body).toMatchSnapshot();
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

  it('maintenance topic body matches snapshot', () => {
    expect(HELP_TOPICS.maintenance.body).toMatchSnapshot();
  });

  it('mail topic body matches snapshot', () => {
    expect(HELP_TOPICS.mail.body).toMatchSnapshot();
  });

  // Full catalog snapshot for belt-and-suspenders coverage
  it('full HELP_TOPICS catalog matches snapshot', () => {
    expect(HELP_TOPICS).toMatchSnapshot();
  });
});
