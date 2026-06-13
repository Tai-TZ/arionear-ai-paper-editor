export type DiffPart = {
  type: "equal" | "delete" | "insert";
  text: string;
};

export type DiffLine = {
  type: "equal" | "delete" | "insert";
  text: string;
};

function lcsDiff<T>(oldItems: T[], newItems: T[], equal: (a: T, b: T) => boolean): DiffLine[] {
  const n = oldItems.length;
  const m = newItems.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = equal(oldItems[i], newItems[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (equal(oldItems[i], newItems[j])) {
      out.push({ type: "equal", text: oldItems[i] as string });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "delete", text: oldItems[i] as string });
      i++;
    } else {
      out.push({ type: "insert", text: newItems[j] as string });
      j++;
    }
  }
  while (i < n) out.push({ type: "delete", text: oldItems[i++] as string });
  while (j < m) out.push({ type: "insert", text: newItems[j++] as string });
  return out;
}

/** Line-level diff — best for LaTeX source review. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  return lcsDiff(oldLines, newLines, (a, b) => a === b);
}

/** Word-level diff for inline red/green highlighting. */
export function diffWords(oldText: string, newText: string): DiffPart[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const mapped = lcsDiff(oldWords, newWords, (a, b) => a === b);
  return mapped.map((row) => ({ type: row.type, text: row.text }));
}
