import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TickContext, TickHandler, TickKind, Unsubscribe } from './tick.types';

/**
 * Drives the two game heartbeats using raw setInterval managed in lifecycle hooks.
 * No @nestjs/schedule — reserved for feature 009's midnight @Cron.
 * @see GEMAIN.C main loop (TICKTIME=6s physics, TICKTIME2=1s ship update)
 * @see GEMAIN.H TICKTIME, TICKTIME2
 */
@Injectable()
export class TickService implements OnModuleInit, OnModuleDestroy {
  private shipUpdateTimer: NodeJS.Timeout | null = null;
  private physicsTimer: NodeJS.Timeout | null = null;

  private readonly handlers: Map<TickKind, Set<TickHandler>> = new Map([
    [TickKind.SHIP_UPDATE, new Set()],
    [TickKind.PHYSICS, new Set()],
  ]);

  private tickNumbers: Record<TickKind, number> = {
    [TickKind.SHIP_UPDATE]: 0,
    [TickKind.PHYSICS]: 0,
  };

  onModuleInit(): void {
    this.tickNumbers = { [TickKind.SHIP_UPDATE]: 0, [TickKind.PHYSICS]: 0 };
    this.shipUpdateTimer = setInterval(() => this.fire(TickKind.SHIP_UPDATE), 1000);
    this.physicsTimer = setInterval(() => this.fire(TickKind.PHYSICS), 6000);
    console.log('[Nest] LOG [TickService]     Started SHIP_UPDATE @1000ms, PHYSICS @6000ms');
  }

  onModuleDestroy(): void {
    if (this.shipUpdateTimer !== null) {
      clearInterval(this.shipUpdateTimer);
      this.shipUpdateTimer = null;
    }
    if (this.physicsTimer !== null) {
      clearInterval(this.physicsTimer);
      this.physicsTimer = null;
    }
    console.log('[Nest] LOG [TickService]     Stopped SHIP_UPDATE, PHYSICS');
  }

  /**
   * Register a handler for a tick kind. Returns an idempotent unsubscribe function.
   * Registering the same handler reference twice for the same kind is a no-op (Set semantics).
   */
  subscribe(kind: TickKind, handler: TickHandler): Unsubscribe {
    this.handlers.get(kind)!.add(handler);
    return () => {
      this.handlers.get(kind)!.delete(handler);
    };
  }

  /** Returns current tick counters for the debug endpoint. */
  getStats(): Record<TickKind, number> {
    return { ...this.tickNumbers };
  }

  private fire(kind: TickKind): void {
    this.tickNumbers[kind]++;
    const ctx: TickContext = { kind, tickNumber: this.tickNumbers[kind], firedAt: new Date() };
    this.dispatch(kind, ctx);
  }

  /** @see GEMAIN.C main loop — one bad subscriber must not stop siblings or the next tick. */
  private dispatch(kind: TickKind, ctx: TickContext): void {
    for (const handler of this.handlers.get(kind)!) {
      try {
        const result = handler(ctx);
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            console.error(`[TickService] async handler error on ${kind} tick ${ctx.tickNumber}:`, err);
          });
        }
      } catch (err) {
        console.error(`[TickService] handler error on ${kind} tick ${ctx.tickNumber}:`, err);
      }
    }
  }
}
