import { memo } from "react";
import { useLocale } from "@/components/locale-provider";
import { editorCopy } from "@/lib/editor-i18n";

export const StatusBar = memo(function StatusBar({ lineCount, className = "" }: { lineCount: number; className?: string }) {
  const { locale } = useLocale();
  const t = editorCopy(locale);

  return (
    <footer
      className={`flex h-7 shrink-0 items-center justify-between border-t border-border bg-card px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground ${className}`}
    >
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-chart-2" />
          {t.statusBar.saved}
        </span>
        <span>{t.statusBar.latex}</span>
        <span>{t.statusBar.utf8}</span>
      </div>
      <div className="flex items-center gap-4">
        <span>{t.statusBar.line(lineCount)}</span>
        <span className="text-[color:var(--editorial-red)]">Arionear</span>
        <span className="text-primary">{t.statusBar.editor}</span>
      </div>
    </footer>
  );
});
