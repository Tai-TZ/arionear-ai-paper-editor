import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import type { DefenseCopy } from "@/lib/defense-i18n";

export type DefensePdfStatus = "waiting" | "compiling" | "ready" | "error";

type Props = {
  status: DefensePdfStatus;
  copy: DefenseCopy["pdfStatus"];
  onRetry?: () => void;
  isRetrying?: boolean;
};

export function DefensePdfStatusBar({ status, copy, onRetry, isRetrying }: Props) {
  const label =
    status === "compiling"
      ? copy.compiling
      : status === "ready"
        ? copy.ready
        : status === "error"
          ? copy.error
          : copy.waiting;

  return (
    <div
      className={`defense-pdf-status defense-pdf-status--${status}`}
      role="status"
      aria-live="polite"
    >
      <span className="defense-pdf-status-label">
        {status === "compiling" || isRetrying ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        ) : status === "ready" ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : status === "error" ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <Loader2 className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
        )}
        {label}
      </span>
      {status === "error" && onRetry ? (
        <button
          type="button"
          className="defense-pdf-status-retry"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw className={`h-3 w-3${isRetrying ? " animate-spin" : ""}`} aria-hidden />
          {copy.retry}
        </button>
      ) : null}
    </div>
  );
}
