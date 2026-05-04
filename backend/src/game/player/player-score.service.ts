import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../combat/combat-events';
import { PlayerScoreRepository } from './player-score.repository';

const AI_USERID_RE = /^(?:Cybrg-|Droid-)/;

/**
 * Listens to COMBAT_SHIP_DESTROYED and forwards score updates to
 * PlayerScoreRepository. Skips when scoreAwarded=0 or no attacker.
 *
 * @see GEFUNCS.C:killem (1143-1185)
 */
@Injectable()
export class PlayerScoreService implements OnModuleInit {
  constructor(
    private readonly events: EventEmitter2,
    private readonly repo: PlayerScoreRepository,
  ) {}

  onModuleInit(): void {
    this.events.on(COMBAT_SHIP_DESTROYED, (payload: CombatShipDestroyedEvent) => {
      void this.handleShipDestroyed(payload);
    });
  }

  private async handleShipDestroyed(event: CombatShipDestroyedEvent): Promise<void> {
    const { attackerUserid, victimUserid, scoreAwarded } = event;
    if (!attackerUserid || scoreAwarded <= 0) return;

    const isAiVictim = AI_USERID_RE.test(victimUserid);
    await this.repo.transferKillScore(attackerUserid, victimUserid, scoreAwarded, isAiVictim);
  }
}
