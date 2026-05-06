import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../combat/combat-events';
import { PlayerScoreRepository } from './player-score.repository';
import { isAiUserid } from '../commands/helpers/ai-userid';

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

/**
 * Listens to COMBAT_SHIP_DESTROYED and forwards score updates to
 * PlayerScoreRepository. Skips when scoreAwarded=0 or no attacker.
 *
 * Also applies the CHGLOSER cash penalty on PvP kills (both sides non-AI).
 *
 * @see GEFUNCS.C:killem (1087-1218)
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
      void this.handleShipDestroyed(payload);
    });
  }

  private async handleShipDestroyed(event: CombatShipDestroyedEvent): Promise<void> {
    const { attackerUserid, victimUserid, scoreAwarded } = event;
    if (!attackerUserid || scoreAwarded <= 0) return;

    const isAiVictim = isAiUserid(victimUserid);
    await this.repo.transferKillScore(attackerUserid, victimUserid, scoreAwarded, isAiVictim);

    // CHGLOSER cash penalty: only when both sides are non-AI human players
    // @see GEFUNCS.C:killem (1087-1218 chgloser block)
    if (!isAiVictim && this.chgLoserPercent > 0 && !isAiUserid(attackerUserid)) {
      await this.repo.applyCashPenalty(attackerUserid, victimUserid, this.chgLoserPercent);
    }
  }
}
