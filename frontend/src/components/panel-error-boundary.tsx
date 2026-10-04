import type { ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

import { useLocale } from "@/components/locale-context";
import { editorShellCopy } from "@/lib/editor-shell-i18n";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { cn } from "@/lib/utils";

type Panel = "chat" | "pdf";

type PanelErrorBoundaryProps = {
  /** Which side panel this guards; picks the fallback message. */
  panel: Panel;
  /** Retry automatically when any of these change (e.g. a new compile or a new message). */
  resetKeys?: unknown[];
  /** Classes for the fallback box so it fits the panel's slot. */
  fallbackClassName?: string;
  children: ReactNode;
};

/**
 * Keeps a crash in a side panel (chat markdown, PDF rendering) local to that panel so the
 * LaTeX editor stays usable.
 */
export function PanelErrorBoundary({
  panel,
  resetKeys,
  fallbackClassName,
  children,
}: PanelErrorBoundaryProps) {
  return (
    <ErrorBoundary
      resetKeys={resetKeys}
      onError={(error) => {
        console.error(error);
        reportLovableError(error, { boundary: `editor_${panel}_panel` });
      }}
      fallbackRender={(props) => (
        <PanelErrorFallback {...props} panel={panel} className={fallbackClassName} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

function PanelErrorFallback({
  resetErrorBoundary,
  panel,
  className,
}: FallbackProps & { panel: Panel; className?: string }) {
  const { locale } = useLocale();
  const copy = editorShellCopy(locale).panelError;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-4 py-6 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      <AlertTriangle className="h-5 w-5 text-destructive" strokeWidth={1.5} aria-hidden />
      <p className="max-w-xs">{panel === "chat" ? copy.chat : copy.pdf}</p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        {copy.retry}
      </button>
    </div>
  );
}
