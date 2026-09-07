import { FES, PERIOD, type Card } from './game';

export type PoolMode = 'normal' | 'box';

export type PoolDef = {
  id: string;
  name: string;
  subtitle: string;
  period: string;
  mode: PoolMode;
  accent: 'fes' | 'box' | 'period';
  // Star weights for non-pity, non-mystery draws (sum = base weight)
  starWeights: { one: number; two: number; three: number };
  // Three-star category weights (FES / Period / Other)
  threeWeights: { fes: number; period: number; other: number };
  // Box mode settings
  mysteryChance?: number;
  mysteryTwoChance?: number;
  mutation?: { '1→2': number; '1→3': number; '2→3': number };
  // Featured card IDs (shown on pool art)
  featured?: string[];
};

export const POOLS: PoolDef[] = [
  {
    id: 'fes-festival',
    name: '幻想祭宴',
    subtitle: 'IMAGINARY FEST · 第1弹',
    period: '1970/01/01 08:00〜2099/01/01 07:59',
    mode: 'normal',
    accent: 'fes',
    featured: ['101330002'],
    starWeights: { one: 72, two: 23, three: 3 },
    threeWeights: { fes: 35, period: 30, other: 35 },
  },
  {
    id: 'mystery-box',
    name: '幻想盲盒',
    subtitle: 'SECRET BOX · 特别企划',
    period: '1970/01/01 08:00〜2099/01/01 07:59',
    mode: 'box',
    accent: 'box',
    featured: ['780230000'],
    starWeights: { one: 72, two: 23, three: 3 },
    threeWeights: { fes: 25, period: 35, other: 40 },
    mysteryChance: 0.02,
    mysteryTwoChance: 0.65,
    mutation: { '1→2': 0.08, '1→3': 0.02, '2→3': 0.05 },
  },
  {
    id: 'period-pickup',
    name: '期间精选',
    subtitle: 'PERIOD PICKUP · 限时登场',
    period: '1970/01/01 08:00〜2099/01/01 07:59',
    mode: 'normal',
    accent: 'period',
    featured: ['201030006'],
    starWeights: { one: 70, two: 25, three: 5 },
    threeWeights: { fes: 10, period: 60, other: 30 },
  },
];

export function getPool(id: string): PoolDef {
  return POOLS.find((p) => p.id === id) ?? POOLS[0];
}

export function nextPool(currentId: string): PoolDef {
  const idx = POOLS.findIndex((p) => p.id === currentId);
  return POOLS[(idx + 1) % POOLS.length];
}

export function prevPool(currentId: string): PoolDef {
  const idx = POOLS.findIndex((p) => p.id === currentId);
  return POOLS[(idx - 1 + POOLS.length) % POOLS.length];
}

export function threeStarPool(
  cards: readonly Card[],
  pool: PoolDef,
  pity: boolean,
): Card[] {
  const all = cards.filter((c) => c.stars === 3);
  if (pity) return all.filter((c) => c.limit === FES);
  return all;
}

export function selectThreeFromPool(
  cards: readonly Card[],
  pool: PoolDef,
  pity: boolean,
  rng: () => number,
): Card {
  const all = cards.filter((c) => c.stars === 3);
  if (pity) {
    const fesCards = all.filter((c) => c.limit === FES);
    return fesCards[Math.floor(rng() * fesCards.length)];
  }
  const groups = [
    {
      pool: all.filter((c) => c.limit === FES),
      weight: pool.threeWeights.fes,
    },
    {
      pool: all.filter((c) => c.limit === PERIOD),
      weight: pool.threeWeights.period,
    },
    {
      pool: all.filter((c) => ![FES, PERIOD].includes(c.limit)),
      weight: pool.threeWeights.other,
    },
  ].filter((g) => g.pool.length);
  let roll = rng() * groups.reduce((sum, g) => sum + g.weight, 0);
  for (const group of groups) {
    roll -= group.weight;
    if (roll < 0) {
      return group.pool[Math.floor(rng() * group.pool.length)];
    }
  }
  return all[Math.floor(rng() * all.length)];
}
