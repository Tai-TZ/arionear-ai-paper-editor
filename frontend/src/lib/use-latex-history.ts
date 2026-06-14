import { useCallback, useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 400;

export function useLatexHistory(initial = "") {
  const [latex, setLatexState] = useState(initial);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const historyRef = useRef<string[]>([initial]);
  const indexRef = useRef(0);
  const skipPushRef = useRef(false);
  const debounceRef = useRef<number>();

  const syncMeta = useCallback(() => {
    setCanUndo(indexRef.current > 0);
    setCanRedo(indexRef.current < historyRef.current.length - 1);
  }, []);

  const pushSnapshot = useCallback(
    (value: string) => {
      const base = historyRef.current.slice(0, indexRef.current + 1);
      if (base[base.length - 1] === value) return;
      historyRef.current = [...base, value];
      indexRef.current = historyRef.current.length - 1;
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
