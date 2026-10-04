export type LineKeyState = {
  lines: readonly string[];
  keys: number[];
  nextKey: number;
};

/**
 * React keys for editor rows that survive edits elsewhere in the document.
 *
 * Lines in the unchanged prefix and suffix keep their previous keys; the changed middle reuses the
 * old middle keys position by position and only lines that were added get fresh keys. Inserting or
 * deleting a line therefore re-renders the edited rows only, instead of every row below them.
 */
export function nextLineKeys(prev: LineKeyState | null, lines: readonly string[]): LineKeyState {
  if (!prev) {
    return { lines, keys: lines.map((_, index) => index), nextKey: lines.length };
  }

  const prevLines = prev.lines;
  const shared = Math.min(prevLines.length, lines.length);
  let prefix = 0;
  while (prefix < shared && prevLines[prefix] === lines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < shared - prefix &&
    prevLines[prevLines.length - 1 - suffix] === lines[lines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const keys = new Array<number>(lines.length);
  for (let i = 0; i < prefix; i += 1) keys[i] = prev.keys[i];

  const prevMiddleEnd = prevLines.length - suffix;
  const middleEnd = lines.length - suffix;
  let nextKey = prev.nextKey;
  for (let i = prefix; i < middleEnd; i += 1) {
    const reused = i < prevMiddleEnd ? prev.keys[i] : undefined;
    keys[i] = reused ?? nextKey++;
  }

  for (let offset = 1; offset <= suffix; offset += 1) {
    keys[lines.length - offset] = prev.keys[prevLines.length - offset];
  }

  return { lines, keys, nextKey };
}
