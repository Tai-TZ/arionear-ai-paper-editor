import { useCallback, useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 400;

/** Undo history bounds; past either one the oldest snapshots are dropped. */
export const HISTORY_LIMITS = {
  maxEntries: 200,
  /** Total characters across snapshots (~40 MB of UTF-16). */
  maxChars: 20_000_000,
};

/**
 * Append `value` after `index` (discarding the redo branch) and trim the oldest snapshots so the
 * history stays within `limits`. The newest snapshot is always kept. Returns null when `value`
 * equals the current snapshot.
 */
export function appendHistorySnapshot(
  history: readonly string[],
  index: number,
  value: string,
  limits: { maxEntries: number; maxChars: number } = HISTORY_LIMITS,
): { history: string[]; index: number } | null {
  const next = history.slice(0, index + 1);
  if (next[next.length - 1] === value) return null;
  next.push(value);

  let totalChars = 0;
  for (const snapshot of next) totalChars += snapshot.length;
  let drop = 0;
  while (
    next.length - drop > 1 &&
    (next.length - drop > limits.maxEntries || totalChars > limits.maxChars)
  ) {
    totalChars -= next[drop].length;
    drop += 1;
  }

  const trimmed = drop > 0 ? next.slice(drop) : next;
  return { history: trimmed, index: trimmed.length - 1 };
}

export function useLatexHistory(initial = "") {
  const [latex, setLatexState] = useState(initial);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const historyRef = useRef<string[]>([initial]);
  const indexRef = useRef(0);
  const skipPushRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);

  const syncMeta = useCallback(() => {
    setCanUndo(indexRef.current > 0);
    setCanRedo(indexRef.current < historyRef.current.length - 1);
  }, []);

  const pushSnapshot = useCallback(
    (value: string) => {
      const next = appendHistorySnapshot(historyRef.current, indexRef.current, value);
      if (!next) return;
      historyRef.current = next.history;
      indexRef.current = next.index;
      syncMeta();
    },
    [syncMeta],
  );

  const setLatex = useCallback(
    (value: string | ((prev: string) => string)) => {
      setLatexState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        if (!skipPushRef.current) {
          window.clearTimeout(debounceRef.current);
          debounceRef.current = window.setTimeout(() => pushSnapshot(next), DEBOUNCE_MS);
        } else {
          skipPushRef.current = false;
        }
        return next;
      });
    },
    [pushSnapshot],
  );

  const resetHistory = useCallback(
    (value: string) => {
      window.clearTimeout(debounceRef.current);
      historyRef.current = [value];
      indexRef.current = 0;
      skipPushRef.current = true;
      setLatexState(value);
      syncMeta();
    },
    [syncMeta],
  );

  const recordNow = useCallback(
    (value: string) => {
      window.clearTimeout(debounceRef.current);
      skipPushRef.current = true;
      setLatexState(value);
      pushSnapshot(value);
    },
    [pushSnapshot],
  );

  const undo = useCallback(() => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    skipPushRef.current = true;
    setLatexState(historyRef.current[indexRef.current]);
    syncMeta();
  }, [syncMeta]);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current += 1;
    skipPushRef.current = true;
    setLatexState(historyRef.current[indexRef.current]);
    syncMeta();
  }, [syncMeta]);

  useEffect(() => {
    return () => window.clearTimeout(debounceRef.current);
  }, []);

  return {
    latex,
    setLatex,
    resetHistory,
    recordNow,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
