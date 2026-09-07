import type { PoolDef } from './pools';

export type Card = {
  id: string;
  name: string;
  stars: number;
  type: 'battle' | 'assist';
  attribute: string;
  limit: string;
  sourceImage: string | null;
};
export type Result = {
  id: string;
  revealed: boolean;
  mystery: boolean;
  mutation: string;
  isNew: boolean;
  pity: boolean;
};
export type Save = {
  format: 'ifbot-pages';
  version: 1;
  balance: number;
  draws: number;
  pity: number;
  collection: Record<string, number>;
  team: { battle: string[]; assist: string[] };
  results: Result[];
  history: string[];
  lastDaily: string;
};
export const SAVE_KEY = 'ifbot.pages-demo.save.v1';
export const PITY_LIMIT = 150;
export const COST = 300;
export const MAX_SAVE_BYTES = 2_000_000;
export const FES = 'フェス限定';
export const PERIOD = '期間限定';
const MAX = 1_000_000_000;

export function newSave(): Save {
  return {
    format: 'ifbot-pages',
    version: 1,
    balance: 30000,
    draws: 0,
    pity: 0,
    collection: {},
    team: { battle: [], assist: [] },
    results: [],
    history: [],
    lastDaily: '',
  };
}
const copy = (save: Save): Save => structuredClone(save);
function fail(message: string): never {
  throw new Error(message);
}
function integer(v: unknown, min = 0, max = MAX): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    fail('存档包含无效数值');
  return v;
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('存档格式不正确');
  return v as Record<string, unknown>;
}
function list(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) fail('存档列表不正确');
  return v;
}
function boolean(v: unknown): boolean {
  if (typeof v !== 'boolean') fail('存档状态不正确');
  return v;
}

// Reconstruct a whitelisted schema: unknown fields/prototype keys never reach state.
export function parseSave(text: string, cards: readonly Card[]): Save {
  if (text.length > MAX_SAVE_BYTES) fail('存档过大（最多 2 MB）');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail('不是有效的 JSON 存档');
  }
  const raw = object(value);
  if (raw.format !== 'ifbot-pages' || raw.version !== 1)
    fail('仅支持本试玩版 v1 存档，不能导入 QQ 机器人存档');
  const byId = new Map(cards.map((c) => [c.id, c]));
  const validId = (v: unknown): string => {
    if (typeof v !== 'string' || !byId.has(v)) fail('存档包含未知卡牌');
    return v;
  };
  const save = newSave();
  save.balance = integer(raw.balance);
  save.draws = integer(raw.draws);
  save.pity = integer(raw.pity, 0, PITY_LIMIT - 1);
  const collection = Object.entries(object(raw.collection));
  if (collection.length > cards.length) fail('卡册过大');
  for (const [id, count] of collection)
    save.collection[validId(id)] = integer(count, 1);
  if (Object.values(save.collection).reduce((a, b) => a + b, 0) !== save.draws)
    fail('抽卡次数与卡册不一致');
  const team = object(raw.team);
  for (const kind of ['battle', 'assist'] as const) {
    save.team[kind] = list(team[kind], 6).map(validId);
    if (new Set(save.team[kind]).size !== save.team[kind].length)
      fail('队伍包含重复卡牌');
    for (const id of save.team[kind]) {
      if (!save.collection[id] || byId.get(id)?.type !== kind)
        fail('队伍包含未持有或类型错误的卡牌');
    }
  }
  save.results = list(raw.results, 10).map((v) => {
    const r = object(v),
      id = validId(r.id);
    if (!save.collection[id]) fail('招募记录包含未持有卡牌');
    if (
      typeof r.mutation !== 'string' ||
      !['', '1 → 2', '1 → 3', '2 → 3'].includes(r.mutation)
    )
      fail('突变记录不正确');
    return {
      id,
      revealed: boolean(r.revealed),
      mystery: boolean(r.mystery),
      mutation: r.mutation,
      isNew: boolean(r.isNew),
      pity: boolean(r.pity),
    };
  });
  save.history = list(raw.history, 50).map(validId);
  if (save.history.some((id) => !save.collection[id]))
    fail('历史记录包含未持有卡牌');
  if (
    typeof raw.lastDaily !== 'string' ||
    (raw.lastDaily !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(raw.lastDaily))
  )
    fail('签到日期不正确');
  save.lastDaily = raw.lastDaily;
  return save;
}

function random(rng: () => number) {
  const n = rng();
  if (!Number.isFinite(n) || n < 0 || n >= 1) fail('随机数不可用');
  return n;
}
function choose<T>(values: readonly T[], rng: () => number): T {
  if (!values.length) fail('卡池缺少必要角色');
  return values[Math.floor(random(rng) * values.length)];
}
export function secureRandom(): number {
  const array = new Uint32Array(1);
  globalThis.crypto.getRandomValues(array);
  return array[0] / 4294967296;
}
function selectThree(
  cards: readonly Card[],
  threeWeights: PoolDef['threeWeights'],
  pity: boolean,
  rng: () => number,
) {
  const all = cards.filter((c) => c.stars === 3);
  if (pity)
    return choose(
      all.filter((c) => c.limit === FES),
      rng,
    );
  const groups = [
    { pool: all.filter((c) => c.limit === FES), weight: threeWeights.fes },
    { pool: all.filter((c) => c.limit === PERIOD), weight: threeWeights.period },
    { pool: all.filter((c) => ![FES, PERIOD].includes(c.limit)), weight: threeWeights.other },
  ].filter((g) => g.pool.length);
  let roll = random(rng) * groups.reduce((sum, g) => sum + g.weight, 0);
  for (const group of groups) {
    roll -= group.weight;
    if (roll < 0) return choose(group.pool, rng);
  }
  return choose(all, rng);
}

export function draw(
  save: Save,
  count: number,
  mode: 'normal' | 'box',
  cards: readonly Card[],
  pool: PoolDef,
  rng = secureRandom,
): Save {
  if (![1, 10].includes(count) || !['normal', 'box'].includes(mode))
    fail('招募参数不正确');
  if (save.results.some((r) => !r.revealed)) fail('请先开启上一轮的全部盲盒');
  if (save.balance < count * COST) fail('呱太不足，可以领取试玩补给');
  if (save.draws + count > MAX) fail('已达到试玩存档上限');
  const next = copy(save);
  next.balance -= count * COST;
  next.results = [];
  // Per-pool probabilities (pools.ts is the single source of truth).
  // FES / period-style pools skip the mutation/mystery modifiers entirely.
  const starTotal = pool.starWeights.one + pool.starWeights.two + pool.starWeights.three;
  const boxMysteryChance =
    mode === 'box' && pool.mysteryChance !== undefined ? pool.mysteryChance : 0;
  const mysteryTwoChance = pool.mysteryTwoChance ?? 0;
  const mutation = pool.mutation;
  for (let i = 0; i < count; i++) {
    const pity = next.pity >= PITY_LIMIT - 1;
    // Only sample the mystery gate in box mode so non-box pools keep the
    // rng sequence aligned with the original behaviour (1 draw = 1 rng).
    const mystery = !pity && mode === 'box' && random(rng) < boxMysteryChance;
    let stars = 3;
    let mutationText = '';
    if (!pity) {
      if (mystery) stars = random(rng) < mysteryTwoChance ? 2 : 3;
      else {
        // pool.starWeights are relative; sum is the roll range.
        const roll = random(rng) * starTotal;
        stars =
          roll < pool.starWeights.one
            ? 1
            : roll < pool.starWeights.one + pool.starWeights.two
              ? 2
              : 3;
      }
    }
    let card =
      stars === 3 && !mystery
        ? selectThree(cards, pool.threeWeights, pity, rng)
        : choose(
            cards.filter((c) => c.stars === stars),
            rng,
          );
    if (mutation && mode === 'box' && !pity && !mystery) {
      const roll = random(rng);
      const upgraded =
        stars === 1
          ? roll < mutation['1→2']
            ? 2
            : roll > 1 - mutation['1→3']
              ? 3
              : stars
          : stars === 2 && roll < mutation['2→3']
            ? 3
            : stars;
      if (upgraded !== stars) {
        mutationText = `${stars} → ${upgraded}`;
        card = choose(
          cards.filter((c) => c.stars === upgraded),
          rng,
        );
      }
    }
    const isNew = !next.collection[card.id];
    next.collection[card.id] = (next.collection[card.id] || 0) + 1;
    next.draws++;
    next.pity = card.stars === 3 && card.limit === FES ? 0 : next.pity + 1;
    next.results.push({
      id: card.id,
      revealed: mode === 'normal',
      mystery,
      mutation: mutationText,
      isNew,
      pity,
    });
    next.history.unshift(card.id);
  }
  next.history = next.history.slice(0, 50);
  return next;
}

export function reveal(save: Save, index: number | 'all'): Save {
  if (index !== 'all') integer(index, 0, save.results.length - 1);
  const next = copy(save);
  next.results.forEach((r, i) => {
    if (index === 'all' || index === i) r.revealed = true;
  });
  return next;
}
export function supply(save: Save): Save {
  const next = copy(save);
  next.balance = Math.min(MAX, next.balance + 30000);
  return next;
}
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function checkIn(save: Save, today = localDay()): Save {
  if (save.lastDaily >= today) fail('今天已签到');
  const next = supply(save);
  next.lastDaily = today;
  return next;
}
export function toggleTeam(
  save: Save,
  id: string,
  cards: readonly Card[],
): Save {
  const card = cards.find((c) => c.id === id);
  if (!card || !save.collection[id]) fail('只能编入已持有卡牌');
  const next = copy(save),
    team = next.team[card.type];
  if (team.includes(id)) next.team[card.type] = team.filter((c) => c !== id);
  else {
    if (team.length >= 6) fail('该类型的 6 个位置已满，请先移除一张卡牌');
    team.push(id);
  }
  return next;
}
