import { useRef } from "react";

import { HighlightedLatexLine } from "@/lib/latex-syntax";

type LatexCodeEditorProps = {
  latex: string;
  onLatexChange: (v: string) => void;
  onSelectionChange?: (v: string) => void;
  fullHeight?: boolean;
};

export function LatexCodeEditor({
  latex,
  onLatexChange,
  onSelectionChange,
  fullHeight = false,
}: LatexCodeEditorProps) {
  const lines = latex.split("\n");
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
  };

  return (
    <div
      className={`latex-editor-shell flex min-h-0 w-full min-w-0 overflow-hidden ${
        fullHeight
          ? "h-full flex-1 rounded-none border-0 shadow-none"
          : "flex-1 rounded-xl border border-border/50 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.12)]"
      }`}
    >
      <div
        ref={gutterRef}
        className="latex-gutter shrink-0 overflow-hidden select-none py-4 pr-2 pl-3 md:pr-3 md:pl-4 text-right font-mono text-[11px] leading-[1.65]"
      >
        {lines.map((_, i) => (
          <div key={i} className="latex-line-num">
            {i + 1}
          </div>
        ))}
      </div>

      <div className="latex-code-area relative min-h-0 min-w-0 flex-1">
        <div
          ref={highlightRef}
          aria-hidden
          className="latex-highlight-layer pointer-events-none absolute inset-0 overflow-hidden py-4 pr-4 md:pr-5 font-mono text-[12px] md:text-[13px] leading-[1.65]"
        >
          {lines.map((line, i) => (
            <div key={i} className="latex-code-row whitespace-pre">
              <HighlightedLatexLine text={line} />
            </div>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={latex}
          onChange={(e) => onLatexChange(e.target.value)}
          onSelect={() => {
            const el = textareaRef.current;
            if (el && onSelectionChange) {
              onSelectionChange(el.value.slice(el.selectionStart, el.selectionEnd));
            }
          }}
          onScroll={syncScroll}
          spellCheck={false}
          className="latex-input latex-input-overlay absolute inset-0 min-h-0 w-full resize-none overflow-auto bg-transparent py-4 pr-4 md:pr-5 font-mono text-[12px] md:text-[13px] leading-[1.65] outline-none"
        />
      </div>
    </div>
  );
}
