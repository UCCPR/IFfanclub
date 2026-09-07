import { newSave, parseSave, SAVE_KEY, type Card, type Save } from './game.ts';

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function readSave(storage: SaveStorage, cards: readonly Card[]): Save {
  const raw = storage.getItem(SAVE_KEY);
  return raw === null ? newSave() : parseSave(raw, cards);
}
// Write successfully before publishing the new state to the UI. Quota/permission
// failures leave the previously displayed save untouched. Call under Web Locks.
export function commitSave(
  storage: SaveStorage,
  cards: readonly Card[],
  action: (s: Save) => Save,
  replacement?: { expected: string | null },
): Save {
  const before = storage.getItem(SAVE_KEY);
  if (replacement && before !== replacement.expected)
    throw new Error('存档已在另一标签页改变，请重新确认');
  const previous = replacement
    ? newSave()
    : before === null
      ? newSave()
      : parseSave(before, cards);
  const next = parseSave(JSON.stringify(action(previous)), cards);
  if (storage.getItem(SAVE_KEY) !== before)
    throw new Error('另一标签页正在保存，请稍后重试');
  storage.setItem(SAVE_KEY, JSON.stringify(next));
  return next;
}
