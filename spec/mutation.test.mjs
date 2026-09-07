import test from 'node:test';
import assert from 'node:assert/strict';
import { mutationSteps, mutationFrame, revealCues } from '../lib/gacha-presentation.ts';

test('upgrades advance through gold before rainbow and restart local progress', () => {
  const card = { stars: 3 };
  const result = { mutation: '1 → 3', mystery: false };
  assert.deepEqual(mutationSteps(result, card), [2, 3]);
  assert.equal(mutationFrame(result, card, 2399 / 4650).target, 2);
  assert.deepEqual(mutationFrame(result, card, 2400 / 4650), { index: 1, target: 3, progress: 0 });
  assert.deepEqual(mutationSteps({ ...result, mutation: '2 → 3' }, card), [3]);
  assert.deepEqual(mutationSteps({ ...result, mutation: '1 → 2' }, { stars: 2 }), [2]);
  assert.deepEqual(mutationSteps({ ...result, mystery: true }, card), []);
  assert.equal(revealCues(result, card)[0].duration, 4650);
  assert.equal(revealCues({ ...result, mutation: '2 → 3' }, card)[0].duration, 2250);
  assert.equal(revealCues(result, card, true)[0].shot, 'reveal');
});
