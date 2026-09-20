import { DeployPhase, DEPLOY_NOTICE_TEXT, DEPLOY_NOTICE_CATEGORY } from '../../src/gateway/deploy-notice.messages';

/**
 * PORT-ORIGINAL copy, approved verbatim by the owner 2026-09-20.
 *
 * Canon has no player-facing shutdown message at all. `clswara()` writes only
 * to the BBS log — GEMAIN.C:1475 `logthis("***GALACTIC EMPIRE SHUTDOWN***")` —
 * and `cmd_sysop` has no broadcast subcommand. A modem game never needed one:
 * the carrier just dropped.
 *
 * These imitate the REGISTER of canon's in-fiction shutdown reports — clipped,
 * addressed to "Sir", e.g. `Shields shut down, Sir.` (MBMGEMSG.MSG:2648) —
 * while saying something canon never had to say.
 *
 * Byte-locked because the wording was negotiated rather than derived: "Nothing
 * aboard will be lost" is a factual claim about restart safety, and "stand by
 * to resume" is the phrase that stops a player closing the tab.
 *
 * @see docs/DECISIONS.md 2026-09-20 — deploy warning broadcast
 */
describe('deploy notice copy', () => {
  it('says what a player needs at five to ten minutes out', () => {
    expect(DEPLOY_NOTICE_TEXT[DeployPhase.INBOUND]).toBe(
      'Sensors read a Fleet Command carrier wave, Sir. Systems refit in 5 to 10 minutes. Nothing aboard will be lost.',
    );
  });

  it('gives a real countdown and an instruction when the restart is imminent', () => {
    expect(DEPLOY_NOTICE_TEXT[DeployPhase.IMMINENT]).toBe(
      'Fleet-wide systems shutdown in 45 seconds, Sir. Your ship holds station. Re-establish contact when comms return.',
    );
  });

  it('signs off as a RESTART, not an ending', () => {
    // "Shutdown" was rejected for this line on purpose: a player reading it as
    // the last thing before the socket closes wonders whether the game is over.
    expect(DEPLOY_NOTICE_TEXT[DeployPhase.DOWN]).toBe(
      'Comms lost. Refit in progress — stand by to resume.',
    );
  });

  it('renders the imminent line as an alert and the rest as system', () => {
    expect(DEPLOY_NOTICE_CATEGORY[DeployPhase.INBOUND]).toBe('system');
    expect(DEPLOY_NOTICE_CATEGORY[DeployPhase.IMMINENT]).toBe('alert');
    expect(DEPLOY_NOTICE_CATEGORY[DeployPhase.DOWN]).toBe('system');
  });

  it('covers every phase, so a new one cannot ship without copy', () => {
    for (const phase of Object.values(DeployPhase)) {
      expect(DEPLOY_NOTICE_TEXT[phase]).toBeTruthy();
      expect(DEPLOY_NOTICE_CATEGORY[phase]).toBeTruthy();
    }
  });
});
