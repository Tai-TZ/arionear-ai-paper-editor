import { Check, ShieldAlert, X } from "lucide-react";

import type { IntegrityFlag } from "@/lib/api/academic";

type SuggestionPanelProps = {
  originalText: string;
  suggestion: string;
  diff: string;
  flags?: IntegrityFlag[];
  applyMode?: "selection" | "document";
  onAccept: () => void;
  onReject: () => void;
};

export function SuggestionPanel({
  suggestion,
  flags = [],
  applyMode = "selection",
  onAccept,
  onReject,
}: SuggestionPanelProps) {
  const hasErrors = flags.some((f) => f.severity === "error");

  return (
    <div className="suggestion-panel shrink-0 border-t border-primary/15 bg-card/98 shadow-[0_-4px_20px_-8px_oklch(0.2_0.02_255_/_12%)] backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-primary">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>
            {applyMode === "document"
              ? "Ario đề xuất thay đổi — inline trong editor (đỏ = xóa, xanh = thêm)"
              : "Ario đề xuất chỉnh sửa — inline trong editor (đỏ = xóa, xanh = thêm)"}
          </span>
          <span className="text-[10px] font-normal text-muted-foreground">
            Ctrl+Enter Accept · Esc Reject
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onReject}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary"
          >
            <X className="h-3 w-3" />
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={hasErrors || !suggestion}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            Accept
          </button>
        </div>
      </div>

      {flags.length > 0 && (
        <ul className="border-t border-border/40 px-3 py-2 text-[11px]">
          {flags.map((f, i) => (
            <li
              key={`${f.code}-${i}`}
              className={
                f.severity === "error"
                  ? "text-destructive"
                  : "text-amber-700 dark:text-amber-400"
              }
            >
              {f.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
