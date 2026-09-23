/**
 * Prose for /calculators.
 *
 * Kept out of the component for the same reason `provenance-notes.ts` is: the
 * numbers on that page come from the server and change with the deployment,
 * but the explanations are editorial and get argued over. Separating them means
 * a copy change is not a change to a page that renders live game data.
 *
 * Every claim below is checkable in `reference/ge-source/GEPLANET.C` or the
 * shipped option database. Where this port deviates from the original, the note
 * says so rather than presenting the deviation as canon.
 */

export const PAGE_TITLE = 'Colony calculators';
export const PAGE_BLURB = 'Work out what a planet will actually produce before you spend a rate point on it';

/** Shown under the title. The honesty notice the design called for. */
export const SCOPE_NOTE =
  'The original had no such thing — this is an addition. Nothing here is invented, though: ' +
  'the server runs your numbers through the same production code the live game runs every ' +
  'tick, so what you see is what your colony will do. It models THIS server’s settings, ' +
  'not stock Galactic Empire, so figures will not match a differently configured game.';

export interface Tip {
  what: string;
  detail: string;
}

/** Production tab. */
export const PRODUCTION_TIPS: readonly Tip[] = Object.freeze([
  {
    what: 'One planet produces every 6 hours, not every minute',
    detail:
      'The galaxy sweeps the planet table constantly, but any single colony is updated once ' +
      'per PLANTOCK — 360 minutes here. Four ticks a day. This is the single most common thing ' +
      'players get wrong, and it makes every rate decision slower to pay off than it looks.',
  },
  {
    what: 'All fourteen rates share one budget of 100',
    detail:
      'Raising one lowers what is left for the rest. A new colony starts at men 50 / food 50, ' +
      'which spends the lot — you have to take from those two before anything else can be made.',
  },
  {
    what: 'Two points of gold buy fifty percent more of everything',
    detail:
      'Production is multiplied by (environment + resource + 2) x 0.25, then by the tax factor, ' +
      'and then by 1.5 if the planet is holding any cash at all. Gold is swept into planet cash ' +
      'every tick, so a tiny gold rate keeps that bonus switched on permanently. It also lowers ' +
      'the food rate you need, because that requirement is 52.5 divided by the same multiplier.',
  },
  {
    what: 'Gold cannot be stockpiled',
    detail:
      'At the top of every tick a planet’s gold is converted to planet cash at base price and ' +
      'the stock is zeroed. You will never haul gold off a colony unless you land inside that ' +
      'window. Treat a gold rate as a switch for the cash bonus, not as income.',
  },
  {
    what: 'Planet cash is not yours',
    detail:
      'It has no withdrawal path. It pays for nothing, and it decays sharply every tick. Its only ' +
      'job is to be greater than zero so the production bonus applies. Money other players spend ' +
      'at your colony lands there too — which is why selling to visitors earns you nothing.',
  },
  {
    what: 'Every slot has a hard ceiling',
    detail:
      'Storage caps are the item’s maximum multiplied by your production multiplier. Flux pods ' +
      'cap low and fill fast; food and men effectively never cap. Production past a full slot is ' +
      'discarded, so the useful rate is the one that refills the cap between your visits.',
  },
]);

/** Survival tab. */
export const SURVIVAL_TIPS: readonly Tip[] = Object.freeze([
  {
    what: 'Colonists eat here — a deliberate change',
    detail:
      'The original debits food for troops only, then starves colonists against that same stock, ' +
      'so a colony with no garrison eats nothing forever. This port charges one food per hundred ' +
      'people for colonists and troops alike. It is the one place on this page where the number ' +
      'is ours rather than Murdock’s.',
  },
  {
    what: 'The stock has to cover the bill twice',
    detail:
      'Food is debited before the starvation test runs, so you need roughly twice one tick’s ' +
      'consumption on the shelf. Fall under it and an eighth of the population dies at once.',
  },
  {
    what: 'Troops eat first',
    detail:
      'If food will not cover the garrison, the stock is emptied outright — and the colonists are ' +
      'then tested against nothing. A large garrison and a thin larder loses you the colony, not ' +
      'just the soldiers.',
  },
  {
    what: 'Breaking even is not enough while you grow',
    detail:
      'A rate that only replaces what was eaten holds your stock level — but the stock you need ' +
      'is two ticks of eating, and that rises with every colonist born. A growing colony at ' +
      'break-even slides under its own floor and loses an eighth of itself. The lowest rate shown ' +
      'here already covers that: it keeps the larder growing as fast as the colony. The same goes ' +
      'for colonists you land: every hundred you drop off needs two more cases on the shelf that ' +
      'same moment, so bring the food with them.',
  },
]);

/** Tax tab. */
export const TAX_TIPS: readonly Tip[] = Object.freeze([
  {
    what: 'Tax is the one colony income that reaches your own credits',
    detail:
      'It accrues into a separate pool from planet cash — the “Tax collected” figure in adm — ' +
      'and you take it with wit while landed on the colony you own, either a named amount or the ' +
      'lot. Planet cash is the opposite and cannot be withdrawn at all, which is the whole reason ' +
      'the two are listed separately.',
  },
  {
    what: 'Tax is charged against all production, not just profit',
    detail:
      'The multiplier carries a factor of (1 - taxrate / 120). At 30% you keep three quarters of ' +
      'everything the colony makes, forever, and that includes shrinking every storage cap by the ' +
      'same fraction.',
  },
  {
    what: 'A garrison at the threshold means no revolt at all',
    detail:
      'Unrest is taxrate / 120 x 0.35 x population. If your troops meet it, the revolt roll is ' +
      'skipped entirely — it is not a reduced chance, it is none. Below it, it is one in ten ' +
      'every tick, and a revolt hands the colony back to nobody.',
  },
  {
    what: 'Growing population makes the garrison a moving target',
    detail:
      'The threshold scales with population, so a garrison that was sufficient yesterday drifts ' +
      'below the line. Sustaining it needs a troop rate of roughly men rate x taxrate / 19.6. ' +
      'Buy the initial garrison rather than growing it — troops are cheap at Tahanian Station.',
  },
  {
    what: 'Tax is often a net loss',
    detail:
      'Compare what the rate collects against the production it costs. On a colony making good ' +
      'money from goods, the production penalty is larger than the tax take — and the troops and ' +
      'extra food needed to support it come out of the same budget of 100.',
  },
  {
    what: 'Raising tax later can delete population',
    detail:
      'The population ceiling is the men cap times the production multiplier, and tax lowers that ' +
      'multiplier. Grow to the ceiling untaxed and then tax, and the excess is clamped away on ' +
      'the next tick. Decide the rate before you grow into it.',
  },
]);

/** Growth tab. */
export const GROWTH_TIPS: readonly Tip[] = Object.freeze([
  {
    what: 'Population compounds',
    detail:
      'Colonists are produced in proportion to how many there already are, so growth is ' +
      'exponential rather than a flat addition, and the men rate is worth more than it looks over ' +
      'weeks. Everything else a colony makes scales with population too.',
  },
  {
    what: 'Goods income does not scale, but tax does',
    detail:
      'Storage caps are absolute — a big colony fills the same flux ceiling as a small one. Tax is ' +
      'the only income that keeps growing with population. That is the argument for growth, and ' +
      'it is a long argument: at four ticks a day it is measured in months.',
  },
  {
    what: 'Hauling is priced per ton, not per unit',
    detail:
      'Once your hold is the constraint, what matters is credits per ton. Zippers beat flux pods ' +
      'roughly two to one on that measure despite being worth half as much each. Check the ' +
      'production table before you fill a hold with the wrong thing.',
  },
]);
