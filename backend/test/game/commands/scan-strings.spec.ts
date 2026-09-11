import {
  populationBand,
  stockpileBand,
  showarpDisplay,
  relativeBearing,
  fmt,
  ENV_STRINGS,
  RES_STRINGS,
  QUALITY,
} from '../../../src/game/commands/handlers/scan/scan-strings';
import { MessageId } from '../../../src/game/commands/messages';

describe('populationBand', () => {
  // Thresholds read from scan.handler.ts populationBand (now scan-strings.ts):
  //   0 -> 'Not'; <2500 -> 'Sparsly'; <10000 -> 'Lightly'; <100000 -> 'Moderatly';
  //   <1000000 -> 'Widely'; else -> 'Heavily'.
  it('bands a population against the canon thresholds', () => {
    expect(populationBand(0n)).toBe('Not');
    expect(populationBand(1n)).toBe('Sparsly');
    expect(populationBand(2499n)).toBe('Sparsly');
    expect(populationBand(2500n)).toBe('Lightly');
    expect(populationBand(9999n)).toBe('Lightly');
    expect(populationBand(10000n)).toBe('Moderatly');
    expect(populationBand(99999n)).toBe('Moderatly');
    expect(populationBand(100000n)).toBe('Widely');
    expect(populationBand(999999n)).toBe('Widely');
    expect(populationBand(1000000n)).toBe('Heavily');
    expect(populationBand(10000000n)).toBe('Heavily');
  });
});

describe('stockpileBand', () => {
  // Thresholds read from scan.handler.ts stockpileBand:
  //   0 -> 'No'; <25 -> 'Small'; <100 -> 'Moderate'; else -> 'Large'.
  it('bands a stockpile quantity against the canon thresholds', () => {
    expect(stockpileBand(0n)).toBe('No');
    expect(stockpileBand(1n)).toBe('Small');
    expect(stockpileBand(24n)).toBe('Small');
    expect(stockpileBand(25n)).toBe('Moderate');
    expect(stockpileBand(99n)).toBe('Moderate');
    expect(stockpileBand(100n)).toBe('Large');
    expect(stockpileBand(1000n)).toBe('Large');
  });
});

describe('showarpDisplay', () => {
  it('formats stopped, impulse and warp speeds', () => {
    expect(showarpDisplay(0)).toBe('Stopped');
    expect(showarpDisplay(1)).toBe('Impulse');
    expect(showarpDisplay(999)).toBe('Impulse');
    expect(showarpDisplay(1000)).toBe('Warp 1.0');
    expect(showarpDisplay(4500)).toBe('Warp 4.5');
  });
});

describe('fmt', () => {
  it('fills the single %s placeholder', () => {
    expect(fmt('%s Populated', 'Heavily')).toBe('Heavily Populated');
  });
});

describe('relativeBearing', () => {
  it('is 0 when the target is dead ahead of a ship on heading 0', () => {
    const ship = { xcoord: 0, ycoord: 0, heading: 0 };
    const target = { xcoord: 0, ycoord: -1 };
    expect(relativeBearing(ship, target)).toBe(0);
  });
});

describe('quality tables', () => {
  it('index the same 4-entry MessageId table for env and resources', () => {
    expect(ENV_STRINGS).toEqual([MessageId.SCAN12, MessageId.SCAN13, MessageId.SCAN14, MessageId.SCAN15]);
    expect(RES_STRINGS).toEqual([MessageId.SCAN12, MessageId.SCAN13, MessageId.SCAN14, MessageId.SCAN15]);
    expect(QUALITY).toEqual([MessageId.SCAN12, MessageId.SCAN13, MessageId.SCAN14, MessageId.SCAN15]);
  });
});
