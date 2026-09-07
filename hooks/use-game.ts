'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { newSave, SAVE_KEY, type Save, type Card } from '@/lib/game';
import { commitSave, readSave } from '@/lib/storage';

export function useGame(cards: readonly Card[]) {
  const [save, setSave] = useState<Save>(newSave);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    function load() {
      try {
        setSave(readSave(localStorage, cards));
        setProblem('');
      } catch (error) {
        setProblem(
          `无法读取本地存档：${error instanceof Error ? error.message : '存储不可用'}。原存档未被覆盖，请到「本地存档」恢复。`,
        );
      } finally {
        setReady(true);
      }
    }
    load();
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVE_KEY || event.key === null) load();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [cards]);

  const commit = useCallback(
    async (
      action: (s: Save) => Save,
      replacement?: { expected: string | null },
    ) => {
      if (inFlight.current) throw new Error('正在保存，请稍后重试');
      inFlight.current = true;
      setBusy(true);
      try {
        const run = () => commitSave(localStorage, cards, action, replacement);
        const next = navigator.locks
          ? await navigator.locks.request(SAVE_KEY, run)
          : run();
        setSave(next);
        setProblem('');
        return next;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [cards],
  );
  return { save, ready, problem, busy, commit };
}
