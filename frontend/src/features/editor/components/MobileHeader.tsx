import { Link } from "@tanstack/react-router";
import { FileOutput, Settings } from "lucide-react";
import { SHOW_EDITOR_IMPORT } from "@/components/workspace/workspace-layout";

export function MobileHeader({
  projectName,
  onUpload,
  onExport,
  exportEnabled = false,
}: {
  projectName: string;
  onUpload: () => void;
  onExport?: () => void;
  exportEnabled?: boolean;
}) {
  return (
    <header className="flex md:hidden shrink-0 items-center justify-between border-b border-border/40 bg-card px-3 py-2.5">
      <Link
        to="/"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition"
      >
        <Settings className="h-4 w-4" />
      </Link>
      <span className="text-sm font-medium truncate px-2">{projectName}</span>
      <div className="flex items-center gap-1.5">
        {onExport ? (
          <button
            type="button"
            onClick={onExport}
            disabled={!exportEnabled}
            className="editor-export-btn-icon md:hidden"
            aria-label="Export"
            title={exportEnabled ? "Export" : "Compile trước khi Export"}
          >
            <FileOutput className="h-4 w-4" />
          </button>
        ) : null}
        {SHOW_EDITOR_IMPORT ? (
          <button
            onClick={onUpload}
            className="rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background shadow-sm transition hover:opacity-90"
          >
            Upload
          </button>
        ) : (
          <div className="w-9 shrink-0" aria-hidden />
        )}
      </div>
    </header>
  );
}
