import type { Card, Result, Save } from './game.ts';

export type CinemaTransition = 'intro' | 'card' | 'all';
export const RESULT_FADE_MS = 350;
export const RESULT_STAGGER_MS = 100;
export function cinemaTransitionDuration(kind: CinemaTransition, count = 1) {
  return kind === 'intro'
    ? 500
    : kind === 'card'
      ? 400
      : RESULT_FADE_MS + Math.max(0, count - 1) * RESULT_STAGGER_MS;
}
export function resultRevealProgress(elapsed: number, order: number) {
  return Math.min(
    1,
    Math.max(0, (elapsed - order * RESULT_STAGGER_MS) / RESULT_FADE_MS),
  );
}

/** Skip only the visible stage; revealing all is exclusive to the icon board. */
export function gachaSkipAction(
  introVisible: boolean,
  active: number | null,
  remaining: number,
) {
  if (introVisible) return 'intro';
  if (active !== null) return 'card';
  return remaining > 0 ? 'all' : null;
}

// Presentation never samples RNG and never changes currency or card inventory.
export function batchKey(save: Save): string {
  return JSON.stringify([
    save.draws,
    save.results.map(({ revealed: _revealed, ...r }) => r),
  ]);
}

export function assertBatch(save: Save, expected: string): void {
  if (batchKey(save) !== expected)
    throw new Error('本轮招募已在其他页面变更，请关闭演出后重试。');
}

export function initialRarity(result: Result, card: Card): number {
  const initial = /^([12]) → [23]$/.exec(result.mutation)?.[1];
  return initial ? Number(initial) : card.stars;
}

export function rarityTone(stars: number): 'silver' | 'gold' | 'rainbow' {
  return stars >= 3 ? 'rainbow' : stars === 2 ? 'gold' : 'silver';
}

export type Shot =
  | 'charge'
  | 'summon'
  | 'silhouette'
  | 'tunnel'
  | 'flash'
  | 'pan-near'
  | 'pan-far'
  | 'pan-wide'
  | 'reveal'
  | 'return'
  | 'complete';
export type Cue = { shot: Shot; duration: number };

export const MUTATION_STEP_MS = 2400;
export const mutationDuration = (target: number) => target === 3 ? 2250 : MUTATION_STEP_MS;
export function mutationSteps(result: Result, card: Card): number[] {
  if (result.mystery || !result.mutation) return [];
  const initial = initialRarity(result, card);
  return Array.from({ length: Math.max(0, card.stars - initial) }, (_, i) => initial + i + 1);
}
export function mutationFrame(result: Result, card: Card, progress: number) {
  const steps = mutationSteps(result, card);
  const total = steps.reduce((sum, target) => sum + mutationDuration(target), 0);
  let remaining = Math.min(0.999999, Math.max(0, progress)) * total;
  for (let index = 0; index < steps.length; index++) {
    const target = steps[index];
    const duration = mutationDuration(target);
    if (remaining < duration) return { index, target, progress: remaining / duration };
    remaining -= duration;
  }
  return { index: 0, target: card.stars, progress };
}

// fps4 is a historical folder name: its samples are ~0.3 s apart, NOT 4 fps.
// Rare timing is aligned with the original recording at 54.75–75 seconds.
export function revealCues(result: Result, card: Card, reduced = false): Cue[] {
  if (reduced) return [{ shot: 'reveal', duration: 0 }];
  // Only upgrades get an in-place icon effect. Ordinary taps do not enlarge
  // the frog or dim the whole display (recording 30–34 s).
  const charge: Cue[] =
    result.mutation || result.mystery
      ? [{ shot: 'charge', duration: result.mystery ? 1200 : mutationSteps(result, card).reduce((sum, target) => sum + mutationDuration(target), 0) }]
      : [];
  if (card.stars >= 3)
    return [
      ...charge,
      { shot: 'summon', duration: 250 },
      { shot: 'tunnel', duration: 8000 },
      { shot: 'flash', duration: 300 },
      { shot: 'pan-near', duration: 2400 },
      { shot: 'pan-far', duration: 2100 },
      { shot: 'pan-wide', duration: 2400 },
      { shot: 'reveal', duration: 4200 },
      { shot: 'return', duration: 600 },
      { shot: 'complete', duration: 0 },
    ];
  return [
    ...charge,
    { shot: 'silhouette', duration: 1500 },
    { shot: 'flash', duration: 500 },
    { shot: 'reveal', duration: 1800 },
    { shot: 'return', duration: 700 },
    { shot: 'complete', duration: 0 },
  ];
}

export function shotAt(
  cues: readonly Cue[],
  elapsed: number,
): { shot: Shot; progress: number } {
  let remaining = Math.max(0, elapsed);
  for (const cue of cues) {
    if (!cue.duration) return { shot: cue.shot, progress: 1 };
    if (remaining < cue.duration)
      return { shot: cue.shot, progress: remaining / cue.duration };
    remaining -= cue.duration;
  }
  return { shot: cues.at(-1)?.shot ?? 'complete', progress: 1 };
}

export function cardTitle(name: string): { title: string; name: string } {
  const match = /^【([^】]+)】(.*)$/.exec(name);
  return match
    ? { title: match[1], name: match[2].trim() }
    : { title: '', name };
}
