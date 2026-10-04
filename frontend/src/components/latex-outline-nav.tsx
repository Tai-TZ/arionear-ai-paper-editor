import { useDeferredValue, useMemo } from "react";

import { parseLatexOutline } from "@/lib/latex-outline";

type LatexOutlineNavProps = {
  latex: string;
  activeLine?: number | null;
  onJumpToLine?: (line: number) => void;
  compact?: boolean;
};

export function LatexOutlineNav({
  latex,
  activeLine = null,
  onJumpToLine,
  compact = false,
}: LatexOutlineNavProps) {
  // Re-parse at background priority so typing in the editor is never blocked by the outline.
  const deferredLatex = useDeferredValue(latex);
  const items = useMemo(() => parseLatexOutline(deferredLatex), [deferredLatex]);

  if (!items.length) {
    return (
      <p className={`text-muted-foreground ${compact ? "text-[10px]" : "text-xs"}`}>
        Chưa có phần nào trong file chính.
      </p>
    );
  }

  return (
    <nav className={`flex flex-col ${compact ? "gap-0.5" : "gap-1"}`}>
      {items.map((item, i) => {
        const isActive = activeLine != null && item.line === activeLine;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onJumpToLine?.(item.line)}
            className={`flex items-center gap-2 rounded-md text-left transition ${
              compact ? "px-2 py-1 text-[12px]" : "rounded-lg px-3 py-2.5 text-sm"
            } ${
              isActive
                ? "bg-sidebar-accent font-medium text-foreground"
                : "text-foreground/80 hover:bg-sidebar-accent/50"
            }`}
            title={`Jump to line ${item.line}`}
          >
            <span
              className={`font-mono text-muted-foreground ${
                compact ? "w-4 text-[9px]" : "w-5 text-[10px]"
              }`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
