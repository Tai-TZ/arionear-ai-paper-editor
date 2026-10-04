/**
 * Math rendering for chat/defense markdown: remark-math + rehype-katex and the KaTeX stylesheet.
 *
 * Loaded on demand through `loadMarkdownMath()` (`markdown-math.ts`), so this chunk (~85 KB gzip of
 * JS, ~8 KB of CSS, plus the KaTeX fonts a formula actually uses) stays out of the editor and
 * defense route bundles until a reply contains `$`.
 */
import "katex/dist/katex.min.css";
import "./markdown-math.css";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { MarkdownMathPlugins } from "./markdown-math";

type Point = { offset?: number };
type MdNode = {
  type: string;
  value?: string;
  children?: MdNode[];
  position?: { start: Point; end: Point };
  /** mdast-util-math stores the hast element of `inlineMath` here (`<code class=…>`). */
  data?: { hProperties?: { className?: unknown } };
};

const WHITESPACE_RE = /\s/;
const DIGIT_RE = /[0-9]/;

/**
 * Whether a `$…$` span parsed by remark-math should really render as math.
 *
 * remark-math pairs dollars like backticks, so "between $5 and $10" becomes the formula "5 and ".
 * Single-dollar spans therefore follow Pandoc's `tex_math_dollars` rule: the content must not start
 * or end with whitespace and the closing `$` must not be followed by a digit. `$x$`, `$O(n)$` and
 * `$\alpha + \beta$` render; "$5 and $10", "$5-$10" and "$ 5 $" stay text. `$$…$$` is always math.
 */
export function isTexMathSpan(raw: string, nextChar: string): boolean {
  if (raw.startsWith("$$")) return true;
  const content = raw.slice(1, -1);
  if (!content) return false;
  if (WHITESPACE_RE.test(content[0]) || WHITESPACE_RE.test(content[content.length - 1])) {
    return false;
  }
  return !DIGIT_RE.test(nextChar);
}

function sourceOf(node: MdNode, source: string): { raw: string; end: number } | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return null;
  return { raw: source.slice(start, end), end };
}

function isBlankText(node: MdNode): boolean {
  return node.type === "text" && !node.value?.trim();
}

function transformChildren(parent: MdNode, source: string): void {
  const children = parent.children;
  if (!children) return;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.type !== "inlineMath") {
      transformChildren(node, source);
      continue;
    }
    const span = sourceOf(node, source);
    if (!span || isTexMathSpan(span.raw, source.charAt(span.end))) continue;
    // Back to the text the author wrote (a span crossing lines may carry container markers in the
    // source, so fall back to the parsed value there).
    const { raw } = span;
    children[i] = { type: "text", value: raw.includes("\n") ? `$${node.value ?? ""}$` : raw };
  }

  // remark-math only treats `$$` on lines of their own as display math; a paragraph that is just
  // `$$…$$` on one line (how LLMs usually write an equation) renders as display math too.
  if (parent.type !== "paragraph") return;
  const content = children.filter((child) => !isBlankText(child));
  const only = content.length === 1 ? content[0] : null;
  if (only?.type !== "inlineMath" || !only.data?.hProperties) return;
  if (sourceOf(only, source)?.raw.startsWith("$$")) {
    only.data.hProperties.className = ["language-math", "math-display"];
  }
}

/**
 * remark plugin, after remark-math: currency-like `$…$` spans go back to plain text
 * (`isTexMathSpan`), and a paragraph holding only `$$…$$` is typeset in display mode.
 */
export function remarkChatMath() {
  return (tree: MdNode, file: { value: unknown }) => {
    transformChildren(tree, String(file.value ?? ""));
  };
}

export const MARKDOWN_MATH_PLUGINS: MarkdownMathPlugins = {
  remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: true }], remarkChatMath],
  // rehype-katex renders with throwOnError itself and, on a parse error, retries with
  // `throwOnError: false` + `strict: "ignore"`, so bad TeX shows KaTeX's inline error text.
  rehypePlugins: [[rehypeKatex, { throwOnError: false, strict: "ignore" }]],
};
