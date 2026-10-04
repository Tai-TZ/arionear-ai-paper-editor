import { memo } from "react";

import { tokenizeLatexLine } from "@/lib/latex-tokenize";

export type { LatexToken } from "@/lib/latex-tokenize";

export const HighlightedLatexLine = memo(function HighlightedLatexLine({
  text,
  highlightRange = null,
}: {
  text: string;
  highlightRange?: { start: number; end: number } | null;
}) {
  if (highlightRange && highlightRange.start < highlightRange.end) {
    const { start, end } = highlightRange;
    return (
      <span className="latex-code-line">
        {start > 0 ? <HighlightedLatexLine text={text.slice(0, start)} /> : null}
        <mark className="latex-synctex-word-hit">{text.slice(start, end)}</mark>
        {end < text.length ? <HighlightedLatexLine text={text.slice(end)} /> : null}
      </span>
    );
  }

  const tokens = tokenizeLatexLine(text);

  if (tokens.length === 0) {
    return <span className="latex-tok-text">&nbsp;</span>;
  }

  return (
    <span className="latex-code-line">
      {tokens.map((token, index) => (
        <span key={index} className={`latex-tok-${token.type}`}>
          {token.text}
        </span>
      ))}
    </span>
  );
});
