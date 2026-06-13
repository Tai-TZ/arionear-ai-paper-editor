import { useMemo, useRef } from "react";

import { diffLines } from "@/lib/text-diff";

type LatexDiffEditorProps = {
  originalText: string;
  suggestedText: string;
  fullHeight?: boolean;
};

export function LatexDiffEditor({
  originalText,
  suggestedText,
  fullHeight = false,
}: LatexDiffEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(
    () => diffLines(originalText, suggestedText),
    [originalText, suggestedText],
  );

  return (
    <div
      className={`latex-editor-shell latex-diff-shell flex min-h-0 flex-col overflow-hidden ${
        fullHeight
          ? "h-full rounded-none border-0 shadow-none"
          : "flex-1 rounded-xl border border-primary/25 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.12)]"
      }`}
    >
      <div className="latex-diff-banner shrink-0 border-b border-border/50 bg-secondary/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="diff-legend diff-legend-del mr-2">đỏ — cũ / xóa</span>
        <span className="diff-legend diff-legend-ins">xanh — mới / thêm</span>
      </div>
      <div
        ref={scrollRef}
        className="soft-scrollbar flex min-h-0 flex-1 overflow-auto font-mono text-[12px] md:text-[13px] leading-[1.65]"
      >
        <div className="latex-gutter shrink-0 select-none py-4 pr-2 pl-3 md:pr-3 md:pl-4 text-right">
          {lines.map((line, i) => (
            <div key={i} className="latex-line-num">
              {i + 1}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 py-4 pr-4 md:pr-5">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`latex-diff-line whitespace-pre ${
                line.type === "delete"
                  ? "latex-diff-line-del"
                  : line.type === "insert"
                    ? "latex-diff-line-ins"
                    : "latex-diff-line-eq"
              }`}
            >
              {line.text || "\u00a0"}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
