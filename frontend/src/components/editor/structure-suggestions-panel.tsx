import { ArrowRight, MapPin, Sparkles, Wrench } from "lucide-react";

import type { StructureSuggestion } from "@/lib/structure-suggestions";
import { buildStructureAskPrompt } from "@/lib/structure-suggestions";
import { useLocale } from "@/components/locale-provider";
import { editorCopy } from "@/lib/editor-i18n";

type StructureSuggestionsPanelProps = {
  suggestions: StructureSuggestion[];
  onJumpToSection: (sectionName: string) => void;
  onAskArio: (prefill: string) => void;
  onApplyFix?: (suggestion: StructureSuggestion) => void;
  canJump: (sectionName: string) => boolean;
};

function severityClass(severity?: string): string {
  if (severity === "warning") {
    return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
  if (severity === "error") {
    return "bg-destructive/15 text-destructive";
  }
  return "bg-primary/10 text-primary";
}

export function StructureSuggestionsPanel({
  suggestions,
  onJumpToSection,
  onAskArio,
  onApplyFix,
  canJump,
}: StructureSuggestionsPanelProps) {
  const { locale } = useLocale();
  const t = editorCopy(locale);

  if (!suggestions.length) {
    return (
      <p className="text-sm text-muted-foreground">{t.tools.structureEmpty}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t.tools.structureIntro}</p>
      <ul className="flex flex-col gap-2">
        {suggestions.map((item, index) => {
          const section = (item.section ?? "").trim() || t.tools.structureUnknownSection;
          const message = (item.message ?? "").trim();
          const jumpable = canJump(section);
          return (
            <li
              key={`${section}-${item.type ?? "item"}-${index}`}
              className="rounded-lg border border-border/70 bg-card/80 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${severityClass(item.severity)}`}
                >
                  {(item.severity ?? "info").toUpperCase()}
                </span>
                {item.type ? (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {item.type}
                  </span>
                ) : null}
                <span className="text-sm font-medium text-foreground">{section}</span>
              </div>
              {message ? (
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{message}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {jumpable ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary"
                    onClick={() => onJumpToSection(section)}
                  >
                    <MapPin className="h-3 w-3" />
                    {t.tools.structureJump}
                  </button>
                ) : null}
                {onApplyFix ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/15"
                    onClick={() => onApplyFix(item)}
                  >
                    <Wrench className="h-3 w-3" />
                    {t.tools.structureApplyFix}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90"
                  onClick={() => onAskArio(buildStructureAskPrompt(item))}
                >
                  <Sparkles className="h-3 w-3" />
                  {t.tools.structureAskArio}
                  <ArrowRight className="h-3 w-3 opacity-70" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
