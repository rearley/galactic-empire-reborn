import { Test } from '@nestjs/testing';
import { CombatModule } from '../../../src/game/combat/combat.module';

describe('CombatModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({ imports: [CombatModule] }).compile();
    expect(module).toBeDefined();
  });
});
