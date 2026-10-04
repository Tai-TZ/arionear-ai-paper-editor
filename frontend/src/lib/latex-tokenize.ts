export type LatexToken = {
  type: "comment" | "cmd" | "opt" | "brace" | "key" | "text";
  text: string;
};

const PERCENT = 37; // %
const AT = 64; // @
const BACKSLASH = 92; // \
const LBRACKET = 91; // [
const RBRACKET = 93; // ]
const LBRACE = 123; // {
const RBRACE = 125; // }
const EQUALS = 61; // =

function isLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

/** End (exclusive) of a `[a-zA-Z@][a-zA-Z0-9]*` run starting at `start`, or -1 when none starts there. */
function identifierEnd(text: string, start: number, end: number): number {
  if (start >= end) return -1;
  const first = text.charCodeAt(start);
  if (!isLetter(first) && first !== AT) return -1;
  let i = start + 1;
  while (i < end) {
    const code = text.charCodeAt(i);
    if (!isLetter(code) && !isDigit(code)) break;
    i += 1;
  }
  return i;
}

/** Splits plain text into `key` tokens (identifier directly followed by `=`) and `text` runs. */
function pushTextTokens(tokens: LatexToken[], text: string, from: number, to: number): void {
  let i = from;
  while (i < to) {
    const keyEnd = identifierEnd(text, i, to);
    if (keyEnd !== -1 && keyEnd < to && text.charCodeAt(keyEnd) === EQUALS) {
      tokens.push({ type: "key", text: text.slice(i, keyEnd) });
      i = keyEnd;
      continue;
    }

    // Every position inside an identifier run ends where the run ends, so a key can only start
    // after it: skipping the run keeps the scan linear without changing where a text run stops.
    let j = keyEnd !== -1 ? keyEnd : i + 1;
    while (j < to) {
      const code = text.charCodeAt(j);
      if (code === BACKSLASH || code === LBRACE || code === LBRACKET) break;
      const runEnd = identifierEnd(text, j, to);
      if (runEnd !== -1) {
        if (runEnd < to && text.charCodeAt(runEnd) === EQUALS) break;
        j = runEnd;
        continue;
      }
      j += 1;
    }

    tokens.push({ type: "text", text: text.slice(i, j) });
    i = j;
  }
}

/** Index just past the bracket matching the opener at `start` (or `to` when it never closes). */
function matchingCloseEnd(
  text: string,
  start: number,
  to: number,
  open: number,
  close: number,
): number {
  let depth = 1;
  let j = start + 1;
  while (j < to && depth > 0) {
    const code = text.charCodeAt(j);
    if (code === open) depth += 1;
    if (code === close) depth -= 1;
    j += 1;
  }
  return j;
}

function tokenizeRange(tokens: LatexToken[], text: string, from: number, to: number): void {
  let i = from;
  while (i < to) {
    const code = text.charCodeAt(i);

    if (code === PERCENT) {
      tokens.push({ type: "comment", text: text.slice(i, to) });
      return;
    }

    if (code === BACKSLASH) {
      let j = i + 1;
      while (j < to) {
        const next = text.charCodeAt(j);
        if (!isLetter(next) && next !== AT) break;
        j += 1;
      }
      if (j > i + 1) {
        tokens.push({ type: "cmd", text: text.slice(i, j) });
        i = j;
        continue;
      }
    }

    if (code === LBRACKET) {
      const j = matchingCloseEnd(text, i, to, LBRACKET, RBRACKET);
      tokens.push({ type: "opt", text: text.slice(i, j) });
      i = j;
      continue;
    }

    if (code === LBRACE) {
      const j = matchingCloseEnd(text, i, to, LBRACE, RBRACE);
      tokens.push({ type: "brace", text: "{" });
      // The inner range always drops the character before `j`, even when the brace never closes
      // on this line; kept as-is so the rendered highlight matches the previous tokenizer exactly.
      tokenizeRange(tokens, text, i + 1, j - 1);
      tokens.push({ type: "brace", text: "}" });
      i = j;
      continue;
    }

    let j = i + 1;
    while (j < to) {
      const next = text.charCodeAt(j);
      if (next === PERCENT || next === BACKSLASH || next === LBRACE || next === LBRACKET) break;
      j += 1;
    }
    pushTextTokens(tokens, text, i, j);
    i = j;
  }
}

/** Tokenize one line of LaTeX for syntax highlighting (single pass, no per-character slicing). */
export function tokenizeLatex(text: string): LatexToken[] {
  const tokens: LatexToken[] = [];
  tokenizeRange(tokens, text, 0, text.length);
  return tokens;
}

const LINE_TOKEN_CACHE_LIMIT = 5000;
const lineTokenCache = new Map<string, readonly LatexToken[]>();

/**
 * Cached {@link tokenizeLatex}: editing one line re-renders the rows around it with text that was
 * already tokenized, so most lookups are hits. Bounded FIFO so huge documents cannot grow it forever.
 * The returned array is shared — callers must not mutate it.
 */
export function tokenizeLatexLine(text: string): readonly LatexToken[] {
  const cached = lineTokenCache.get(text);
  if (cached) return cached;
  const tokens = tokenizeLatex(text);
  if (lineTokenCache.size >= LINE_TOKEN_CACHE_LIMIT) {
    const oldest = lineTokenCache.keys().next();
    if (!oldest.done) lineTokenCache.delete(oldest.value);
  }
  lineTokenCache.set(text, tokens);
  return tokens;
}
