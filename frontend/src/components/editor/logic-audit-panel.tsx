import { useEffect, useMemo, useState } from "react";
import { Files, Loader2, Play, Square, Zap } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { editorCopy, logicAuditModeHint } from "@/lib/editor-i18n";
import {
  buildLogicConflictAskPrompt,
  buildLogicCrossSectionAskPrompt,
  buildLogicWeakClaimAskPrompt,
  defaultQuickSectionSelection,
  listLogicAuditSectionOptions,
  type LogicAuditMode,
  type LogicAuditScope,
} from "@/lib/logic-audit";
import { parseLatexOutline } from "@/lib/latex-outline";
import type { LogicAuditReport } from "@/lib/api/academic";
import { cn } from "@/lib/utils";

type LogicAuditPanelProps = {
  latex: string;
  report: LogicAuditReport | null;
  loading?: boolean;
  reportStale?: boolean;
  progressDetail?: string | null;
  sectionProgress?: { completed: number; total: number } | null;
  engineAvailable?: boolean;
  /** When set (e.g. from /logic or /logic full in chat), sync the scope toggle. */
  scopeHint?: LogicAuditScope | null;
  onRun: (mode: LogicAuditMode, scope: LogicAuditScope, sections: string[]) => void;
  onCancel?: () => void;
  onJumpToIssue?: (sectionName: string, excerpt?: string) => void;
  onAskArio?: (prefill: string, sectionName: string, excerpt?: string) => void;
  canJumpToIssue?: (sectionName: string, excerpt?: string) => boolean;
};

export function LogicAuditPanel({
  latex,
  report,
  loading = false,
  reportStale = false,
  progressDetail = null,
  sectionProgress = null,
  engineAvailable = true,
  scopeHint = null,
  onRun,
  onCancel,
  onJumpToIssue,
  onAskArio,
  canJumpToIssue,
}: LogicAuditPanelProps) {
  const { locale } = useLocale();
  const t = editorCopy(locale).logicAudit;
  const [scope, setScope] = useState<LogicAuditScope>("selected");
  const sectionOptions = useMemo(
    () => listLogicAuditSectionOptions(parseLatexOutline(latex)),
    [latex],
  );
  const [selected, setSelected] = useState<string[]>(() =>
    defaultQuickSectionSelection(sectionOptions),
  );

  useEffect(() => {
    if (scopeHint) setScope(scopeHint);
  }, [scopeHint]);

  useEffect(() => {
    if (scope === "full") return;
    setSelected(defaultQuickSectionSelection(sectionOptions));
  }, [sectionOptions, scope]);

  const auditFull = scope === "full";

  const severityLabel = (severity?: string): string => {
    switch ((severity ?? "").toLowerCase()) {
      case "critical":
        return t.severityCritical;
      case "warning":
        return t.severityWarning;
      case "info":
        return t.severityInfo;
      default:
        return (severity ?? "INFO").toUpperCase();
    }
  };

  const toggleSection = (name: string) => {
    if (auditFull) return;
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name],
    );
  };

  const canRun =
    (auditFull || selected.length > 0) && !loading && sectionOptions.length > 0 && engineAvailable;
  const partialReport = report?.meta?.partial === true;
  const sectionsSkipped =
    typeof report?.meta?.sections_skipped === "number" && report.meta.sections_skipped > 0
      ? report.meta.sections_skipped
      : 0;
  const progressPct =
    sectionProgress && sectionProgress.total > 0
      ? Math.min(100, Math.round((sectionProgress.completed / sectionProgress.total) * 100))
      : 0;

  const runButtonLabel = loading ? t.running : auditFull ? t.runQuickFull : t.runQuick;

  return (
    <div className="logic-audit-panel">
      <p className="mt-1 text-xs text-muted-foreground">{t.intro}</p>

      {!engineAvailable ? (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t.engineUnavailable}
        </p>
      ) : null}

      {reportStale ? (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t.staleReport}
        </p>
      ) : null}

      {loading && (report?.sections?.length ?? 0) > 0 ? (
        <p className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {t.auditingInProgress}
        </p>
      ) : null}

      {partialReport && !reportStale ? (
        <p className="mt-3 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          {t.partialReport}
        </p>
      ) : null}

      {sectionsSkipped > 0 && !loading ? (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t.sectionsSkipped(sectionsSkipped)}
        </p>
      ) : null}

      <div className="logic-audit-mode-toggle mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(
          [
            {
              id: "selected" as const,
              icon: Zap,
              label: t.scanQuick,
              subtitle: t.scanQuickSubtitle,
            },
            {
              id: "full" as const,
              icon: Files,
              label: t.scanFull,
              subtitle: t.scanFullSubtitle(sectionOptions.length),
            },
          ] as const
        ).map(({ id, icon: Icon, label, subtitle }) => (
          <button
            key={id}
            type="button"
            onClick={() => setScope(id)}
            className={cn(
              "logic-audit-mode-btn rounded-lg border px-3 py-2 text-left transition",
              scope === id
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border/60 bg-card hover:bg-muted/40",
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="text-xs font-semibold">{label}</span>
            </div>
            <span className="mt-1 block text-[10px] leading-snug text-muted-foreground">{subtitle}</span>
          </button>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {logicAuditModeHint(locale, scope)}
      </p>

      {!auditFull ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t.pickSections}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-[10px] text-primary hover:underline"
                onClick={() => setSelected(sectionOptions)}
              >
                {t.selectAll}
              </button>
              <button
                type="button"
                className="text-[10px] text-primary hover:underline"
                onClick={() => setSelected(defaultQuickSectionSelection(sectionOptions))}
              >
                {t.imradDefault}
              </button>
            </div>
          </div>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto soft-scrollbar">
            {sectionOptions.map((name) => {
              const active = selected.includes(name);
              return (
                <label
                  key={name}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition",
                    active
                      ? "border-primary/40 bg-primary/5"
                      : "border-transparent hover:bg-muted/50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleSection(name)}
                    className="h-3.5 w-3.5 accent-[var(--primary)]"
                  />
                  <span className="truncate">{name}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {t.willScanParts(sectionOptions.length)}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!canRun}
          onClick={() => onRun("quick", scope, auditFull ? [] : selected)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {runButtonLabel}
        </button>
        {loading && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50"
          >
            <Square className="h-3 w-3 fill-current" />
            {t.cancel}
          </button>
        ) : null}
      </div>

      {loading && sectionProgress && sectionProgress.total > 0 ? (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{t.sectionProgress(sectionProgress.completed, sectionProgress.total)}</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {loading && progressDetail ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{progressDetail}</p>
      ) : null}

      {report?.sections?.length ? (
        <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
          {report.summary ? <p className="text-sm text-foreground">{report.summary}</p> : null}
          {typeof report.meta?.audit_mode === "string" ? (
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {String(report.meta.audit_mode)}
              {typeof report.meta.audit_scope === "string"
                ? ` · ${String(report.meta.audit_scope)}`
                : ""}
            </p>
          ) : null}
          {report.sections.map((section) => (
            <div key={section.section} className="rounded-md border border-border/60 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.section}
              </h3>
              {(section.conflicts ?? []).length === 0 && !(section.weak_claims ?? []).length ? (
                <p className="mt-2 text-xs text-muted-foreground">{t.noIssues}</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {(section.conflicts ?? []).map((c) => {
                    const excerpt = c.claim_text?.trim() || undefined;
                    const jumpable = canJumpToIssue?.(section.section, excerpt) ?? false;
                    return (
                      <li key={c.id} className="rounded-md border border-border/40 px-2 py-2 text-xs">
                        <div>
                          <span className="font-medium text-[color:var(--editorial-red)]">
                            [{severityLabel(c.severity)}]
                          </span>{" "}
                          {c.comment}
                        </div>
                        {c.claim_text?.trim() ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">{t.claimLabel}</span>{" "}
                            {c.claim_text.trim()}
                          </p>
                        ) : null}
                        {(onJumpToIssue || onAskArio) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {onJumpToIssue && jumpable ? (
                              <button
                                type="button"
                                className="text-[10px] text-primary hover:underline"
                                onClick={() => onJumpToIssue(section.section, excerpt)}
                              >
                                {t.jumpToIssue}
                              </button>
                            ) : null}
                            {onAskArio ? (
                              <button
                                type="button"
                                className="text-[10px] text-primary hover:underline"
                                onClick={() =>
                                  onAskArio(
                                    buildLogicConflictAskPrompt({
                                      section: section.section,
                                      comment: c.comment,
                                      claimText: c.claim_text,
                                    }),
                                    section.section,
                                    excerpt,
                                  )
                                }
                              >
                                {t.askArio}
                              </button>
                            ) : null}
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {(section.weak_claims ?? []).map((w, i) => {
                    const jumpable = canJumpToIssue?.(section.section, w) ?? false;
                    return (
                      <li
                        key={`weak-${i}`}
                        className="rounded-md border border-dashed border-border/40 px-2 py-2 text-xs text-muted-foreground"
                      >
                        <div>
                          [{t.weak}] {w}
                        </div>
                        {(onJumpToIssue || onAskArio) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {onJumpToIssue && jumpable ? (
                              <button
                                type="button"
                                className="text-[10px] text-primary hover:underline"
                                onClick={() => onJumpToIssue(section.section, w)}
                              >
                                {t.jumpToIssue}
                              </button>
                            ) : null}
                            {onAskArio ? (
                              <button
                                type="button"
                                className="text-[10px] text-primary hover:underline"
                                onClick={() =>
                                  onAskArio(
                                    buildLogicWeakClaimAskPrompt(section.section, w),
                                    section.section,
                                    w,
                                  )
                                }
                              >
                                {t.askArio}
                              </button>
                            ) : null}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
          {(report.cross_section_conflicts ?? []).map((cross, i) => {
            const firstSpan = cross.spans?.[0];
            const jumpSection = firstSpan?.section ?? "Abstract";
            const jumpExcerpt = firstSpan?.text?.trim() || undefined;
            const jumpable = canJumpToIssue?.(jumpSection, jumpExcerpt) ?? false;
            return (
            <div
              key={`cross-${i}`}
              className="rounded-md border border-dashed border-border/60 p-3 text-xs"
            >
              <span className="font-medium">{t.crossSection}</span> {cross.description}
              {(jumpable || onAskArio) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {jumpable && onJumpToIssue ? (
                    <button
                      type="button"
                      className="text-[10px] font-medium text-primary hover:underline"
                      onClick={() => onJumpToIssue(jumpSection, jumpExcerpt)}
                    >
                      {t.jumpToIssue}
                    </button>
                  ) : null}
                  {onAskArio ? (
                    <button
                      type="button"
                      className="text-[10px] font-medium text-primary hover:underline"
                      onClick={() =>
                        onAskArio(
                          buildLogicCrossSectionAskPrompt(cross.description, jumpSection),
                          jumpSection,
                          jumpExcerpt,
                        )
                      }
                    >
                      {t.askArio}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">{t.panelNote}</p>
      )}
    </div>
  );
}
