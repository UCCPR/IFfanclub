import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  draw,
  newSave,
  FES,
  PERIOD,
  parseSave,
  reveal,
  toggleTeam,
  supply,
  checkIn,
  MAX_SAVE_BYTES,
  localDay,
} from '../lib/game.ts';
import { commitSave, readSave } from '../lib/storage.ts';
import { registerGameTools } from '../lib/webmcp.ts';

const actual = JSON.parse(
  await readFile(new URL('../lib/cards.json', import.meta.url), 'utf8'),
);
const card = (id, stars, limit = '恒常', type = 'battle') => ({
  id,
  stars,
  limit,
  type,
  name: id,
  attribute: '红',
  sourceImage: null,
});
const cards = [
  card('1', 1),
  card('2', 2),
  card('3', 3),
  card('4', 3, FES),
  card('5', 3, PERIOD),
  card('6', 1, '恒常', 'assist'),
];
const zeros = () => 0;
function sequence(...values) {
  let i = 0;
  return () => values[i++] ?? 0.5;
}
const TEST_NORMAL_POOL = Object.freeze({
  id: 'test-normal',
  name: 'Test Normal',
  subtitle: 'Test',
  period: 'TEST',
  mode: 'normal',
  accent: 'period',
  starWeights: Object.freeze({ one: 72, two: 23, three: 3 }),
  threeWeights: Object.freeze({ fes: 25, period: 35, other: 40 }),
});
const TEST_BOX_POOL = Object.freeze({
  id: 'test-box',
  name: 'Test Box',
  subtitle: 'Test',
  period: 'TEST',
  mode: 'box',
  accent: 'box',
  starWeights: Object.freeze({ one: 72, two: 23, three: 3 }),
  threeWeights: Object.freeze({ fes: 25, period: 35, other: 40 }),
  mysteryChance: 0.02,
  mysteryTwoChance: 0.65,
  mutation: Object.freeze({ '1→2': 0.08, '1→3': 0.02, '2→3': 0.05 }),
});
function storage(raw = null) {
  return {
    raw,
    getItem() {
      return this.raw;
    },
    setItem(_key, value) {
      this.raw = value;
    },
  };
}

test('public pool is complete, unique and playable', () => {
  assert.equal(actual.length, 794);
  assert.equal(new Set(actual.map((c) => c.id)).size, actual.length);
  for (const stars of [1, 2, 3]) assert(actual.some((c) => c.stars === stars));
  assert(actual.some((c) => c.limit === FES && c.stars === 3));
  assert(actual.every((c) => /^card_cutin_\d+\.png$/.test(c.sourceImage)));
});
test('new save is independent and round trips', () => {
  const a = newSave(),
    b = newSave();
  a.collection['1'] = 1;
  assert.deepEqual(b.collection, {});
  assert.deepEqual(parseSave(JSON.stringify(b), cards), b);
});
test('ten draw cost, counts and duplicate NEW flags; input not mutated', () => {
  const previous = newSave(),
    next = draw(previous, 10, 'normal', cards, TEST_NORMAL_POOL, zeros);
  assert.equal(previous.balance, 30000);
  assert.equal(next.balance, 27000);
  assert.equal(next.draws, 10);
  assert.equal(next.pity, 10);
  assert.equal(next.collection['1'], 10);
  assert.equal(next.results.filter((r) => r.isNew).length, 1);
  assert(next.results.every((r) => r.revealed));
  assert.deepEqual(parseSave(JSON.stringify(next), cards), next);
});
test('invalid counts, mode and insufficient funds fail without mutation', () => {
  const s = newSave();
  s.balance = 299;
  for (const count of [0, -1, 2, 10, 1, Infinity])
    assert.throws(() => draw(s, count, 'normal', cards));
  assert.throws(() => draw(newSave(), 1, 'fake', cards));
  assert.equal(s.draws, 0);
});
test('150th draw, including inside ten draws, is guaranteed FES', () => {
  const s = newSave();
  s.pity = 145;
  const next = draw(s, 10, 'normal', cards, TEST_NORMAL_POOL, zeros);
  assert.equal(next.results[4].id, '4');
  assert.equal(next.results[4].pity, true);
  assert.equal(next.pity, 5);
});
test('natural FES resets pity; non-FES 3-star advances it', () => {
  const s = newSave();
  s.pity = 24;
  const fes = draw(s, 1, 'normal', cards, TEST_NORMAL_POOL, sequence(0.999, 0.1, 0));
  const other = draw(s, 1, 'normal', cards, TEST_NORMAL_POOL, sequence(0.999, 0.99, 0));
  assert.equal(fes.pity, 0);
  assert.equal(other.pity, 25);
});
test('rarity thresholds use normalized 72:23:3 weights', () => {
  assert.equal(
    draw(newSave(), 1, 'normal', cards, TEST_NORMAL_POOL, sequence(71.99 / 98, 0)).results[0].id,
    '1',
  );
  assert.equal(
    draw(newSave(), 1, 'normal', cards, TEST_NORMAL_POOL, sequence(72.01 / 98, 0)).results[0].id,
    '2',
  );
  assert.equal(
    draw(newSave(), 1, 'normal', cards, TEST_NORMAL_POOL, sequence(95.01 / 98, 0.99, 0))
      .results[0].id,
    '3',
  );
});
test('mystery boxes persist predetermined rewards and reveal is idempotent', () => {
  const s = draw(newSave(), 1, 'box', cards, TEST_BOX_POOL, zeros);
  assert.equal(s.results[0].mystery, true);
  assert.equal(s.results[0].id, '2');
  assert.throws(() => draw(s, 1, 'normal', cards));
  const reopened = parseSave(JSON.stringify(s), cards);
  const next = reveal(reopened, 0);
  assert.equal(next.balance, 29700);
  assert.equal(next.draws, 1);
  assert.deepEqual(reveal(next, 'all'), next);
  assert.equal(s.results[0].revealed, false);
  assert.throws(() => reveal(next, -1));
  assert.throws(() => reveal(next, 1));
});
test('normal box mutations follow configured branches', () => {
  const next = draw(newSave(), 1, 'box', cards, TEST_BOX_POOL, sequence(0.9, 0, 0, 0.999, 0));
  assert.equal(next.results[0].mutation, '1 → 3');
  assert.equal(next.results[0].id, '3');
  const second = draw(
    newSave(),
    1,
    'box',
    cards,
    TEST_BOX_POOL,
    sequence(0.9, 0.8, 0, 0.01, 0),
  );
  assert.equal(second.results[0].mutation, '2 → 3');
});
test('pity boxes bypass mystery and mutation', () => {
  const s = newSave();
  s.pity = 149;
  const next = draw(s, 1, 'box', cards, TEST_BOX_POOL, zeros);
  assert.equal(next.results[0].id, '4');
  assert.equal(next.results[0].mystery, false);
  assert.equal(next.results[0].mutation, '');
  assert.equal(next.pity, 0);
});
test('team accepts only owned cards, by type, at most six with removal', () => {
  const pool = Array.from({ length: 7 }, (_, i) => card(String(i + 10), 1));
  pool.push(card('99', 1, '恒常', 'assist'));
  let s = newSave();
  for (const c of pool) s.collection[c.id] = 1;
  for (const c of pool.slice(0, 6)) s = toggleTeam(s, c.id, pool);
  assert.throws(() => toggleTeam(s, '16', pool));
  assert.throws(() => toggleTeam(s, 'missing', pool));
  s = toggleTeam(s, '99', pool);
  assert.deepEqual(s.team.assist, ['99']);
  s = toggleTeam(s, '10', pool);
  assert.equal(s.team.battle.length, 5);
});
test('daily reward is once per local calendar day; supplies are repeatable', () => {
  const s = checkIn(newSave(), '2026-09-03');
  assert.equal(s.balance, 60000);
  assert.throws(() => checkIn(s, '2026-09-03'));
  assert.throws(() => checkIn(s, '2026-09-02'));
  assert.equal(checkIn(s, '2026-09-04').balance, 90000);
  assert.equal(supply(supply(newSave())).balance, 90000);
  assert.equal(localDay(new Date(2026, 8, 3, 0, 1)), '2026-09-03');
});
test('history is bounded after long play and survives import', () => {
  let s = newSave();
  for (let i = 0; i < 80; i++) s = draw(supply(s), 10, 'normal', cards, TEST_NORMAL_POOL, zeros);
  assert.equal(s.history.length, 50);
  assert.equal(s.draws, 800);
  assert.deepEqual(parseSave(JSON.stringify(s), cards), s);
});
test('bad and foreign saves are rejected; unknown fields stripped', () => {
  for (const text of [
    '',
    'null',
    '{}',
    '[]',
    '{oops',
    ' '.repeat(MAX_SAVE_BYTES + 1),
  ])
    assert.throws(() => parseSave(text, cards));
  for (const change of [
    { version: 2 },
    { format: 'qq-bot' },
    { balance: -1 },
    { balance: '300' },
    { pity: 150 },
    { results: Array(11).fill({}) },
    { collection: { unknown: 1 } },
    { draws: 1 },
    { team: { battle: ['1'], assist: [] } },
    { lastDaily: 42 },
  ]) {
    assert.throws(() =>
      parseSave(JSON.stringify({ ...newSave(), ...change }), cards),
    );
  }
  assert.deepEqual(
    parseSave(JSON.stringify({ ...newSave(), password: 'not-copied' }), cards),
    newSave(),
  );
  assert.throws(() =>
    parseSave(
      JSON.stringify({
        ...newSave(),
        collection: JSON.parse('{"__proto__":1}'),
      }),
      cards,
    ),
  );
});
test('unknown or duplicated team IDs and malformed result flags fail import', () => {
  const s = draw(newSave(), 1, 'normal', cards, TEST_NORMAL_POOL, zeros);
  s.team.battle = ['1', '1'];
  assert.throws(() => parseSave(JSON.stringify(s), cards));
  s.team.battle = [];
  s.results[0].revealed = 'yes';
  assert.throws(() => parseSave(JSON.stringify(s), cards));
});
test('invalid RNG fails atomically and empty pools never charge', () => {
  for (const n of [1, -1, NaN])
    assert.throws(() => draw(newSave(), 1, 'normal', cards, TEST_NORMAL_POOL, () => n));
  const s = newSave();
  assert.throws(() => draw(s, 1, 'normal', [], zeros));
  assert.equal(s.balance, 30000);
});
test('storage commits, reloads and never writes corrupt or failed updates', () => {
  const db = storage();
  const s = commitSave(db, cards, (s) => draw(s, 1, 'normal', cards, TEST_NORMAL_POOL, zeros));
  assert.deepEqual(readSave(db, cards), s);
  const previous = db.raw;
  assert.throws(() =>
    commitSave(db, cards, () => {
      throw new Error('fail');
    }),
  );
  assert.equal(db.raw, previous);
  db.raw = '{corrupt';
  assert.throws(() => commitSave(db, cards, supply));
  assert.equal(db.raw, '{corrupt');
  const reset = commitSave(db, cards, newSave, { expected: '{corrupt' });
  assert.equal(reset.draws, 0);
});
test('storage quota and replacement conflicts preserve old data', () => {
  const db = storage(JSON.stringify(newSave())),
    previous = db.raw;
  assert.throws(() => commitSave(db, cards, newSave, { expected: 'outdated' }));
  assert.equal(db.raw, previous);
  db.setItem = () => {
    throw new Error('Quota exceeded');
  };
  assert.throws(() => commitSave(db, cards, supply));
  assert.equal(db.raw, previous);
});
test('WebMCP uses same game actions, validates inputs and cleans up', async () => {
  const registered = new Map();
  let s = newSave();
  const db = storage();
  const stop = registerGameTools(
    {
      registerTool(tool, options) {
        registered.set(tool.name, { tool, options });
      },
    },
    {
      read: () => s,
      draw: async (count, mode) =>
        (s = commitSave(db, cards, (state) =>
          draw(state, count, mode, cards, mode === 'box' ? TEST_BOX_POOL : TEST_NORMAL_POOL, zeros),
        )),
      reveal: async () =>
        (s = commitSave(db, cards, (state) => reveal(state, 'all'))),
    },
  );
  assert.equal(registered.size, 3);
  const read = registered.get('read_game_status').tool,
    recruit = registered.get('draw_demo_cards').tool;
  assert.equal(read.annotations.readOnlyHint, true);
  assert.equal(recruit.annotations.readOnlyHint, false);
  await assert.rejects(() => recruit.execute({ count: 9, mode: 'normal' }));
  assert.equal(s.draws, 0);
  const result = await recruit.execute({ count: 1, mode: 'box' });
  assert.equal(result.balance, 29700);
  assert.equal(result.results[0].id, undefined);
  await registered.get('reveal_all_demo_boxes').tool.execute({});
  assert.equal(read.execute({}).results[0].id, '2');
  stop();
  assert(registered.get('read_game_status').options.signal.aborted);
  assert.doesNotThrow(() => registerGameTools(undefined, {}));
});
