import { Module, OnModuleInit } from '@nestjs/common';
import { InvariantRegistry } from './harness';
import { weaponFireRangeRespected } from './combat-ranges.invariants';
import {
  aiCannotFireAcrossMap,
  aiRespectsNeutralZone,
} from './ai-targeting.invariants';
import { scanRangeMatchesScanType } from './scanners.invariants';
import {
  inMemoryShipMatchesDb,
  noOrphanShipState,
} from './ship-persistence.invariants';

/**
 * Wires the six seed invariants from Task 6 onto the singleton registry on
 * module init. Plain class providers — the registry stays a normal Nest
 * provider so other modules can `inject(InvariantRegistry)` as usual.
 */
@Module({
  providers: [InvariantRegistry],
  exports: [InvariantRegistry],
})
export class InvariantsModule implements OnModuleInit {
  constructor(private readonly registry: InvariantRegistry) {}

  onModuleInit(): void {
    this.registry.register(weaponFireRangeRespected);
    this.registry.register(aiCannotFireAcrossMap);
    this.registry.register(aiRespectsNeutralZone);
    this.registry.register(scanRangeMatchesScanType);
    this.registry.register(inMemoryShipMatchesDb);
    this.registry.register(noOrphanShipState);
  }
}
