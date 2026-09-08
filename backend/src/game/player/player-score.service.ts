import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../combat/combat-events';
import { PlayerScoreRepository } from './player-score.repository';
import { isAiUserid } from '../commands/helpers/ai-userid';
import { killScoreBonus } from './kill-score';
import { SCRBONUS } from '../constants';

/**
 * Named constant for AI victim userid prefixes — documents which prefixes
 * participate in the AI-victim contract (isAiVictim=true path).
 *
 * - 'Cybrg-' prefix: Cybertron ships — no victim deduction, cash penalty skipped.
 * - '@Droid-' prefix: Droid ships — same AI path, tolerates absent User row.
 *   FR-025/026: Droid victims already award score via the existing transferKillScore
 *   path (isAiVictim=true). A future refactor MUST NOT regress this.
 *
 * @see backend/src/game/player/player-score.repository.ts:24-55
 * @see GEFUNCS.C:killem (1143-1218) — AI victim branching
 */
export const AI_VICTIM_PREFIXES = ['Cybrg-', '@Droid-'] as const;

/** Internal event fired when a Cybertron attacker scores a kill — picked up by CybertronTickService. */
export const CYBERTRON_SCORED_KILL = 'cybertron.scored-kill' as const;

/** Payload for CYBERTRON_SCORED_KILL. */
export interface CybertronScoredKillEvent {
  attackerUserid: string;
  attackerShipKey: string;
}

/**
 * Listens to COMBAT_SHIP_DESTROYED and forwards score updates to
 * PlayerScoreRepository. Skips when scoreAwarded=0 or no attacker.
 *
 * Also applies the CHGLOSER cash penalty on PvP kills (both sides non-AI).
 * When the attacker is a Cybertron (Cybrg- prefix), emits CYBERTRON_SCORED_KILL
 * so CybertronTickService can increment the DB kill counter without creating
 * a circular module dependency (PlayerScoreModule → CybertronModule → CombatModule).
 *
 * @see GEFUNCS.C:killem (1087-1218)
 * @see GECYBS.C — kill counter escalation
 */
@Injectable()
export class PlayerScoreService implements OnModuleInit {
  constructor(
    private readonly events: EventEmitter2,
    private readonly repo: PlayerScoreRepository,
    private readonly chgLoserPercent: number,
  ) {}

  onModuleInit(): void {
    this.events.on(COMBAT_SHIP_DESTROYED, (payload: CombatShipDestroyedEvent) => {
      // Returned, not voided: `emit` on a live tick discards this, but the
      // shutdown drain uses `emitAsync` and awaits it, so a kill settled on the
      // way out still transfers the score and the cash penalty.
      // @see game/combat/combat-tick.service.ts beforeApplicationShutdown
      return this.handleShipDestroyed(payload);
    });
  }

  private async handleShipDestroyed(event: CombatShipDestroyedEvent): Promise<void> {
    const { attackerUserid, victimUserid, scoreAwarded } = event;
    if (!attackerUserid || scoreAwarded <= 0) return;

    const isAiVictim = isAiUserid(victimUserid);
    const isAiAttacker = isAiUserid(attackerUserid);

    // `amt = scr + bonus` (GEFUNCS.C:1155). The bonus divides SCRBONUS by the
    // VICTIM's roster position, so killing the top-ranked commander pays far
    // more than killing a drifter. It is applied here rather than in the combat
    // tick because rospos is a User column the midnight job assigns, and the
    // tick scores synchronously from in-memory ship state that does not carry
    // it. An AI victim has no user row and so pays no bonus, which matches C:
    // an automaton is never on the roster.
    const bonus = isAiVictim
      ? 0
      : killScoreBonus(await this.repo.getRospos(victimUserid), SCRBONUS);

    await this.repo.transferKillScore(
      attackerUserid, victimUserid, scoreAwarded + bonus, isAiVictim, isAiAttacker,
    );

    // CHGLOSER cash penalty: only when both sides are non-AI human players
    // @see GEFUNCS.C:killem (1087-1218 chgloser block)
    if (!isAiVictim && this.chgLoserPercent > 0 && !isAiAttacker) {
      await this.repo.applyCashPenalty(attackerUserid, victimUserid, this.chgLoserPercent);
    }

    // Cybertron kill counter — emit an event instead of calling CybertronRepository
    // directly, to avoid a circular module dependency (PlayerScoreModule → CybertronModule
    // → CombatModule → PlayerScoreModule). CybertronTickService handles the DB increment.
    // @see GEFUNCS.C:1253 — droid attacker kills not persisted
    if (isAiAttacker && attackerUserid.startsWith('Cybrg-') && event.attackerShipKey) {
      this.events.emit(CYBERTRON_SCORED_KILL, {
        attackerUserid,
        attackerShipKey: event.attackerShipKey,
      } satisfies CybertronScoredKillEvent);
    }
  }
}
