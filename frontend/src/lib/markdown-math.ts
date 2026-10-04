import { useEffect, useSyncExternalStore } from "react";
import type { Options as ReactMarkdownOptions } from "react-markdown";

export type MarkdownMathPlugins = {
  remarkPlugins: NonNullable<ReactMarkdownOptions["remarkPlugins"]>;
  rehypePlugins: NonNullable<ReactMarkdownOptions["rehypePlugins"]>;
};

/** `$` (remark-math delimiters) or a ```math fence (rendered by rehype-katex too). */
const MATH_HINT_RE = /\$|^ {0,3}(?:`{3,}|~{3,})\s*math\b/m;

/** Cheap pre-check: only text that could hold math needs the math plugins (and the KaTeX chunk). */
export function mayContainMath(text: string): boolean {
  return MATH_HINT_RE.test(text);
}

let loaded: MarkdownMathPlugins | null = null;
let pending: Promise<MarkdownMathPlugins> | null = null;
const listeners = new Set<() => void>();

/** Load remark-math + rehype-katex + the KaTeX CSS once (a separate chunk); retried after a failure. */
export function loadMarkdownMath(): Promise<MarkdownMathPlugins> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import("./markdown-math-plugins").then(
    (mod) => {
      loaded = mod.MARKDOWN_MATH_PLUGINS;
      for (const listener of listeners) listener();
      return loaded;
    },
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Math plugins for one markdown body, or `null` to render it with the plain plugins.
 *
 * Math runs only once `ready` (a finished reply: a half-streamed `$` would flicker between text and
 * formula) and only when the text has a math delimiter. The KaTeX chunk starts loading as soon as a
 * `$` shows up, even mid-stream, so it is usually there when the reply completes; until it arrives
 * the body renders as plain markdown, exactly as it did before math support.
 */
export function useMarkdownMath(text: string, ready: boolean): MarkdownMathPlugins | null {
  const hasMath = mayContainMath(text);
  // Same snapshot on the server: nothing loads there (effects never run), so it is null unless a
  // caller preloaded the plugins, e.g. a test rendering to static markup.
  const getSnapshot = () => (hasMath && ready ? loaded : null);
  const plugins = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (hasMath && !loaded) loadMarkdownMath().catch(() => {});
  }, [hasMath]);

  return plugins;
}
