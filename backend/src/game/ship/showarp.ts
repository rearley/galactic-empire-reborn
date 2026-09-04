/**
 * Canon's `showarp` — a speed as the BARE figure, no unit word.
 *
 *   0            -> "0.00"
 *   > warp 99.999 -> "Hyper"
 *   otherwise    -> "%.2f" of speed/1000
 *   @see GEFUNCS.C:2674
 *
 * The word belongs to the caller: `SPEEDIS {Helm reports speed is now Warp %s,
 * Sir!}` and `SCAN04 {Speed: Warp %s}` both supply it. The port instead split
 * the number in two and printed "warp 10 point 00", which is neither canon's
 * wording nor a form anything else in the game uses.
 */
export function showarp(speed: number): string {
  if (speed === 0) return '0.00';
  if (speed / 1000 > 99.999) return 'Hyper';
  return (speed / 1000).toFixed(2);
}
