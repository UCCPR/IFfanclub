import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { newSave, draw, reveal } from '../lib/game.ts';
import {
  batchKey,
  assertBatch,
  initialRarity,
  rarityTone,
  revealCues,
  shotAt,
  cardTitle,
  gachaSkipAction,
  cinemaTransitionDuration,
  resultRevealProgress,
} from '../lib/gacha-presentation.ts';

const cards = JSON.parse(
  await readFile(new URL('../lib/cards.json', import.meta.url), 'utf8'),
);
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
const one = cards.find((c) => c.stars === 1);
const three = cards.find((c) => c.stars === 3);
const result = {
  id: one.id,
  revealed: false,
  mutation: '',
  mystery: false,
  pity: false,
  isNew: true,
};

test('stage handoffs and staggered result crossfades have bounded durations', () => {
  assert.equal(cinemaTransitionDuration('intro'), 500);
  assert.equal(cinemaTransitionDuration('card'), 400);
  assert.equal(cinemaTransitionDuration('all', 1), 350);
  assert.equal(cinemaTransitionDuration('all', 10), 1250);
  assert.equal(resultRevealProgress(-1, 0), 0);
  assert.equal(resultRevealProgress(175, 0), 0.5);
  assert.equal(resultRevealProgress(175, 2), 0);
  assert.equal(resultRevealProgress(1075, 9), 0.5);
  assert.equal(resultRevealProgress(1250, 9), 1);
  assert.equal(resultRevealProgress(99999, 0), 1);
});

test('SKIP is scoped to intro, current character, or remaining board cards', () => {
  assert.equal(gachaSkipAction(true, null, 10), 'intro');
  assert.equal(gachaSkipAction(true, 0, 10), 'intro');
  assert.equal(gachaSkipAction(false, 0, 10), 'card');
  assert.equal(gachaSkipAction(false, 9, 1), 'card');
  // Replaying an already revealed card still skips only its animation.
  assert.equal(gachaSkipAction(false, 1, 0), 'card');
  assert.equal(gachaSkipAction(false, null, 10), 'all');
  assert.equal(gachaSkipAction(false, null, 1), 'all');
  assert.equal(gachaSkipAction(false, null, 0), null);
});

test('ordinary reveal starts directly with silhouette and returns to the grid', () => {
  const cues = revealCues(result, one);
  assert.deepEqual(
    cues.map((c) => c.shot),
    ['silhouette', 'flash', 'reveal', 'return', 'complete'],
  );
  assert.equal(shotAt(cues, -20).shot, 'silhouette');
  assert.equal(shotAt(cues, 1500).shot, 'flash');
  assert.equal(shotAt(cues, 2000).shot, 'reveal');
  assert.equal(shotAt(cues, 3000).shot, 'reveal');
  assert.equal(shotAt(cues, 3800).shot, 'return');
  assert.equal(shotAt(cues, 4150).progress, 0.5);
  assert.equal(shotAt(cues, 4500).shot, 'complete');
  assert.equal(shotAt(cues, 100000).shot, 'complete');
});

test('three-star reveal uses two closeups, a wide shot, and automatic return', () => {
  const cues = revealCues(result, three);
  assert.deepEqual(
    cues.map((c) => c.shot),
    [
      'summon',
      'tunnel',
      'flash',
      'pan-near',
      'pan-far',
      'pan-wide',
      'reveal',
      'return',
      'complete',
    ],
  );
  // No mutation in this fixture, so the cue list starts at 'summon' (250ms)
  // and every later boundary shifts 250ms earlier than a charged reveal.
  assert.equal(shotAt(cues, 7100).progress, 0.85625);
  for (const [time, shot] of [
    [200, 'summon'],
    [8400, 'flash'],
    [9000, 'pan-near'],
    [11500, 'pan-far'],
    [14000, 'pan-wide'],
    [18000, 'reveal'],
    [19900, 'return'],
    [21000, 'complete'],
  ]) {
    assert.equal(shotAt(cues, time).shot, shot);
  }
});

test('reduced motion goes straight to the character without flashes', () => {
  for (const card of [one, three]) {
    assert.deepEqual(revealCues(result, card, true), [
      { shot: 'reveal', duration: 0 },
    ]);
    assert.equal(shotAt(revealCues(result, card, true), 0).shot, 'reveal');
  }
});

test('upgraded cards use the initial frog rarity, not the final rarity', () => {
  assert.equal(initialRarity({ ...result, mutation: '1 → 3' }, three), 1);
  assert.equal(initialRarity({ ...result, mutation: '2 → 3' }, three), 2);
  assert.equal(initialRarity(result, three), 3);
  assert.deepEqual([1, 2, 3].map(rarityTone), ['silver', 'gold', 'rainbow']);
  assert.equal(
    revealCues({ ...result, mutation: '1 → 3' }, three)[0].duration,
    4650,
  );
});

test('skip, reveal and replay do not reroll or debit an already committed draw', () => {
  let save = draw(newSave(), 10, 'box', cards, TEST_BOX_POOL, () => 0.5);
  const before = structuredClone(save);
  const key = batchKey(save);
  for (let replay = 0; replay < 3; replay++) {
    for (let i = 0; i < save.results.length; i++) {
      save = reveal(save, i);
      const c = cards.find((card) => card.id === save.results[i].id);
      shotAt(revealCues(save.results[i], c), 100000);
    }
    save = reveal(save, 'all');
  }
  assert.equal(batchKey(save), key);
  assert.equal(save.balance, before.balance);
  assert.equal(save.draws, before.draws);
  assert.equal(save.pity, before.pity);
  assert.deepEqual(save.collection, before.collection);
  assert.deepEqual(
    save.results.map((r) => r.id),
    before.results.map((r) => r.id),
  );
});

test('batch guard accepts reveals but rejects another draw or import', () => {
  const save = draw(newSave(), 1, 'box', cards, TEST_BOX_POOL, () => 0.5);
  const key = batchKey(save);
  assert.doesNotThrow(() => assertBatch(reveal(save, 'all'), key));
  assert.throws(() =>
    assertBatch(
      draw(reveal(save, 'all'), 1, 'normal', cards, TEST_NORMAL_POOL, () => 0.5),
      key,
    ),
  );
  assert.throws(() => assertBatch(newSave(), key));
  const altered = structuredClone(save);
  altered.results[0].mystery = !altered.results[0].mystery;
  assert.throws(() => assertBatch(altered, key));
});

test('character captions come from the actual card, never invented dialogue', () => {
  assert.deepEqual(cardTitle('【不幸体質】上条 当麻'), {
    title: '不幸体質',
    name: '上条 当麻',
  });
  assert.deepEqual(cardTitle('上条 当麻'), { title: '', name: '上条 当麻' });
});

test('UI sources are explicit, present, portable and bounded', async () => {
  const ui = JSON.parse(
    await readFile(
      new URL('../lib/gacha-assets.json', import.meta.url),
      'utf8',
    ),
  );
  // The allow-list may grow as more original UI layers are restored, but it
  // must stay explicit and small enough for the static Pages bundle.
  assert.ok(Object.keys(ui).length >= 100);
  assert.ok(Object.keys(ui).length <= 180);
  for (const color of ['red', 'blue', 'green', 'yellow', 'purple']) {
    assert.ok(ui['element-' + color]);
    assert.ok(ui['element-super-' + color]);
  }
  assert.equal(
    ui['skip-label'],
    'assets/gacha/skit_menu_btn_label_tutorialskip.png',
  );
  assert.equal(ui['skip-base'], 'assets/gacha/skit_menu_btn.png');
  assert.equal(ui['tap-hand'], 'assets/gacha/gacha_icon_tap_00.png');
  assert.equal(
    ui['draw-blue'],
    'assets/gacha/gacha_btn_play_01.png',
  );
  assert.equal(
    ui['draw-pink'],
    'assets/gacha/gacha_btn_play_02.png',
  );
  for (const [key, source] of Object.entries(ui)) {
    assert.match(key, /^[a-z0-9-]+$/);
    assert.match(source, /^assets\/gacha\/[\w]+\.png$/);
    assert.ok(
      (await stat(new URL('../' + source, import.meta.url))).isFile(),
    );
  }
});
