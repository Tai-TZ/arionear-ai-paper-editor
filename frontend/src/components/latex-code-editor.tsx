import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  forwardRef,
} from "react";

import { HighlightedLatexLine } from "@/lib/latex-syntax";
import { buildInlineSuggestionView, type InlineSuggestionInput } from "@/lib/inline-suggestion";
import {
  readEditorSelection,
  type EditorSelectionContext,
  type SelectionAnchor,
} from "@/lib/editor-selection-anchor";
import type { SynctexWordHighlight } from "@/lib/synctex-highlight";

export type LatexCodeEditorHandle = {
  scrollToLine: (line: number, start?: number, end?: number) => void;
};

type LatexCodeEditorProps = {
  latex: string;
  onLatexChange: (v: string) => void;
  onSelectionChange?: (v: string) => void;
  onSelectionContextChange?: (
    payload: { context: EditorSelectionContext; anchor: SelectionAnchor } | null,
  ) => void;
  onQuickEditRequest?: (payload: {
    context: EditorSelectionContext;
    anchor: SelectionAnchor;
  }) => void;
  fullHeight?: boolean;
  readOnly?: boolean;
  highlightLine?: number | null;
  synctexHighlight?: SynctexWordHighlight | null;
  inlineSuggestion?: InlineSuggestionInput | null;
};

export const LatexCodeEditor = forwardRef<LatexCodeEditorHandle, LatexCodeEditorProps>(
  function LatexCodeEditor(
    {
      latex,
      onLatexChange,
      onSelectionChange,
      onSelectionContextChange,
      onQuickEditRequest,
      fullHeight = false,
      readOnly: readOnlyProp = false,
      highlightLine = null,
      synctexHighlight = null,
      inlineSuggestion = null,
    },
    ref,
  ) {
    const suggestionView = useMemo(
      () => (inlineSuggestion ? buildInlineSuggestionView(latex, inlineSuggestion) : null),
      [latex, inlineSuggestion],
    );
    const displayLatex = suggestionView?.displayLatex ?? latex;
    const lines = displayLatex.split(/\r?\n/);
    const readOnly = Boolean(suggestionView) || readOnlyProp;
    const gutterRef = useRef<HTMLDivElement>(null);
    const highlightRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const measureProbeRef = useRef<HTMLSpanElement | null>(null);

    const publishSelection = useCallback(() => {
      const ta = textareaRef.current;
      if (!ta || readOnly) {
        onSelectionContextChange?.(null);
        return;
      }
      const picked = readEditorSelection(ta);
      if (picked) {
        onSelectionChange?.(picked.context.text);
        onSelectionContextChange?.(picked);
        return;
      }
      onSelectionChange?.("");
      onSelectionContextChange?.(null);
    }, [readOnly, onSelectionChange, onSelectionContextChange]);

    const syncScroll = () => {
      const ta = textareaRef.current;
      if (!ta) return;
      if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
      if (highlightRef.current) {
        highlightRef.current.scrollTop = ta.scrollTop;
        highlightRef.current.scrollLeft = ta.scrollLeft;
      }
      publishSelection();
    };

    const measurePrefixWidth = (prefix: string, reference: HTMLElement): number => {
      const host = reference.parentElement;
      if (!host) return prefix.length * 7.8;

      let probe = measureProbeRef.current;
      if (!probe) {
        probe = document.createElement("span");
        probe.setAttribute("aria-hidden", "true");
        probe.className = "latex-editor-canvas latex-measure-probe";
        probe.style.cssText =
          "position:absolute;visibility:hidden;white-space:pre;pointer-events:none;top:-9999px;left:0;height:auto;width:auto;overflow:visible;padding:0;border:0;margin:0;";
        host.appendChild(probe);
        measureProbeRef.current = probe;
      }

      const style = getComputedStyle(reference);
      probe.style.font = style.font;
      probe.style.fontSize = style.fontSize;
      probe.style.fontFamily = style.fontFamily;
      probe.style.fontWeight = style.fontWeight;
      probe.style.letterSpacing = style.letterSpacing;
      probe.style.tabSize = style.tabSize;
      probe.style.fontKerning = style.fontKerning;
      probe.style.fontFeatureSettings = style.fontFeatureSettings;
      probe.textContent = prefix.replace(/\t/g, "    ");
      return probe.getBoundingClientRect().width;
    };

    const scrollHorizontally = (line: number, start?: number, end?: number) => {
      const ta = textareaRef.current;
      const layer = highlightRef.current;
      if (!ta) return;

      void ta.scrollWidth;

      const margin = 72;
      const viewport = ta.clientWidth;
      const maxScroll = Math.max(0, ta.scrollWidth - viewport);

      const mark = layer?.querySelector("mark.latex-synctex-word-hit");
      if (mark && layer) {
        const layerRect = layer.getBoundingClientRect();
        const markRect = mark.getBoundingClientRect();
        const wordLeft = markRect.left - layerRect.left + ta.scrollLeft;
        const wordRight = wordLeft + markRect.width;

        let scrollLeft = ta.scrollLeft;
        if (wordLeft < scrollLeft + margin || wordRight > scrollLeft + viewport - margin) {
          scrollLeft = wordLeft - margin;
          if (wordRight - scrollLeft > viewport - margin) {
            scrollLeft = wordRight - viewport + margin;
          }
        }

        ta.scrollLeft = Math.max(0, Math.min(scrollLeft, maxScroll));
        syncScroll();
        return;
      }

      if (start == null || start < 0) return;

      const lineText = (ta.value.split(/\r?\n/)[line - 1] ?? "").replace(/\t/g, "    ");
      const wordEnd = end != null && end > start ? end : start + 1;
      const beforeWidth = measurePrefixWidth(lineText.slice(0, start), ta);
      const wordWidth = measurePrefixWidth(lineText.slice(start, wordEnd), ta);

      let scrollLeft = beforeWidth + wordWidth + margin - viewport;
      scrollLeft = Math.max(scrollLeft, beforeWidth - margin);
      scrollLeft = Math.max(0, Math.min(scrollLeft, maxScroll));
      ta.scrollLeft = scrollLeft;
      syncScroll();
    };

    const scrollToLineInternal = (line: number, start?: number, end?: number) => {
      const ta = textareaRef.current;
      if (!ta || line < 1) return;
      const lineHeight = ta.clientHeight > 0 ? getComputedStyle(ta).lineHeight : "21.45px";
      const lh = parseFloat(lineHeight) || 21.45;
      ta.scrollTop = Math.max(0, (line - 3) * lh);

      const runHorizontal = () => scrollHorizontally(line, start, end);
      runHorizontal();
      requestAnimationFrame(() => {
        runHorizontal();
        requestAnimationFrame(runHorizontal);
      });
      window.setTimeout(runHorizontal, 60);
      window.setTimeout(runHorizontal, 160);
      window.setTimeout(runHorizontal, 320);
    };

    useImperativeHandle(ref, () => ({
      scrollToLine(line: number, start?: number, end?: number) {
        scrollToLineInternal(line, start, end);
      },
    }));

    useLayoutEffect(() => {
      if (!suggestionView) return;
      scrollToLineInternal(suggestionView.changeStartLine);
    }, [suggestionView?.displayLatex]);

    useLayoutEffect(() => {
      if (!highlightLine || highlightLine < 1) return;
      const start = synctexHighlight?.line === highlightLine ? synctexHighlight.start : undefined;
      const end = synctexHighlight?.line === highlightLine ? synctexHighlight.end : undefined;
      scrollToLineInternal(highlightLine, start, end);
    }, [highlightLine, synctexHighlight?.line, synctexHighlight?.start, synctexHighlight?.end]);

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
          {lines.map((_, i) => {
            const lineNo = i + 1;
            const inChange =
              suggestionView &&
              lineNo >= suggestionView.changeStartLine &&
              lineNo <= suggestionView.changeEndLine;
            return (
              <div
                key={i}
                className={`latex-line-num ${
                  highlightLine === lineNo
                    ? "bg-primary/15 text-primary font-semibold"
                    : inChange
                      ? "latex-line-num-change"
                      : ""
                }`}
              >
                {lineNo}
              </div>
            );
          })}
        </div>

        <div className="latex-code-area relative min-h-0 min-w-0 flex-1">
          <div
            ref={highlightRef}
            aria-hidden
            className="latex-highlight-layer latex-editor-canvas pointer-events-none absolute inset-0 overflow-hidden"
          >
            {lines.map((line, i) => {
              const lineNo = i + 1;
              const viewLine = suggestionView?.lines[i];
              const range =
                synctexHighlight?.line === lineNo
                  ? { start: synctexHighlight.start, end: synctexHighlight.end }
                  : null;
              const inChange =
                suggestionView &&
                lineNo >= suggestionView.changeStartLine &&
                lineNo <= suggestionView.changeEndLine;

              return (
                <div
                  key={i}
                  className={`latex-code-row ${inChange ? "latex-code-row-change" : ""}`}
                >
                  {viewLine?.kind === "del" ? (
                    <span className="latex-code-line diff-del">
                      <HighlightedLatexLine text={line} />
                    </span>
                  ) : viewLine?.kind === "ins" ? (
                    <span className="latex-code-line diff-ins">
                      <HighlightedLatexLine text={line} />
                    </span>
                  ) : (
                    <HighlightedLatexLine text={line} highlightRange={range} />
                  )}
                </div>
              );
            })}
          </div>

          <textarea
            ref={textareaRef}
            value={displayLatex}
            readOnly={readOnly}
            wrap="off"
            onChange={(e) => {
              if (!readOnly) onLatexChange(e.target.value);
            }}
            onMouseUp={publishSelection}
            onKeyUp={publishSelection}
            onKeyDown={(e) => {
              if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k" || readOnly) return;
              const ta = textareaRef.current;
              if (!ta || !onQuickEditRequest) return;
              const picked = readEditorSelection(ta);
              if (!picked?.context.text.trim()) return;
              e.preventDefault();
              onQuickEditRequest(picked);
            }}
            onSelect={publishSelection}
            onBlur={() => {
              window.setTimeout(() => onSelectionContextChange?.(null), 180);
            }}
            onScroll={syncScroll}
            spellCheck={false}
            className={`latex-input latex-input-overlay latex-editor-canvas absolute inset-0 min-h-0 w-full resize-none overflow-auto bg-transparent outline-none ${
              readOnly ? "latex-input-readonly cursor-default" : ""
            }`}
          />
        </div>
      </div>
    );
  },
);
