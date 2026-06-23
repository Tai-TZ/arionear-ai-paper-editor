import { useEffect, useMemo, useState } from "react";
import { Files, Loader2, Play, Sparkles, Zap } from "lucide-react";

import {
  defaultQuickSectionSelection,
  listLogicAuditSectionOptions,
  logicAuditModeHint,
  logicAuditModeLabel,
  type LogicAuditMode,
  type LogicAuditScope,
} from "@/lib/logic-audit";
import { parseLatexOutline } from "@/lib/latex-outline";
import type { LogicAuditReport } from "@/lib/api/academic";
import { cn } from "@/lib/utils";

function severityLabel(severity?: string): string {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return "NGHIÊM TRỌNG";
    case "warning":
      return "CẢNH BÁO";
    case "info":
      return "GỢI Ý";
    default:
      return (severity ?? "INFO").toUpperCase();
  }
}

type LogicAuditPanelProps = {
  latex: string;
  report: LogicAuditReport | null;
  loading?: boolean;
  onRun: (mode: LogicAuditMode, scope: LogicAuditScope, sections: string[]) => void;
};

export function LogicAuditPanel({ latex, report, loading = false, onRun }: LogicAuditPanelProps) {
  const [mode, setMode] = useState<LogicAuditMode>("quick");
  const [scope, setScope] = useState<LogicAuditScope>("selected");
  const sectionOptions = useMemo(
    () => listLogicAuditSectionOptions(parseLatexOutline(latex)),
    [latex],
  );
  const [selected, setSelected] = useState<string[]>(() =>
    defaultQuickSectionSelection(sectionOptions),
  );

  useEffect(() => {
    if (scope === "full") return;
    setSelected(defaultQuickSectionSelection(sectionOptions));
  }, [sectionOptions, scope]);

  const auditFull = scope === "full";

  const toggleSection = (name: string) => {
    if (auditFull) return;
    if (mode === "deep") {
      setSelected([name]);
      return;
    }
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name],
    );
  };

  const canRun = (auditFull || selected.length > 0) && !loading && sectionOptions.length > 0;

  return (
    <div className="logic-audit-panel">
      <p className="mt-1 text-xs text-muted-foreground">
        Comment-only — không tự sửa bản thảo. Chế độ audit dùng engine riêng, không phụ thuộc
        provider trong chat.
      </p>

      <div className="logic-audit-mode-toggle mt-4 grid grid-cols-2 gap-2">
        {(
          [
            { id: "quick" as const, icon: Zap, subtitle: "OpenRouter" },
            { id: "deep" as const, icon: Sparkles, subtitle: "MiniMax M3" },
          ] as const
        ).map(({ id, icon: Icon, subtitle }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              if (id === "deep" && !auditFull && selected.length > 1) {
                setSelected([selected[0]]);
              }
            }}
            className={cn(
              "logic-audit-mode-btn rounded-lg border px-3 py-2 text-left transition",
              mode === id
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border/60 bg-card hover:bg-muted/40",
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="text-xs font-semibold">{logicAuditModeLabel(id)}</span>
            </div>
            <span className="mt-1 block text-[10px] text-muted-foreground">{subtitle}</span>
          </button>
        ))}
      </div>

      <label
        className={cn(
          "mt-3 flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 transition",
          auditFull ? "border-primary/40 bg-primary/5" : "border-border/60 hover:bg-muted/30",
        )}
      >
        <input
          type="checkbox"
          checked={auditFull}
          onChange={(e) => setScope(e.target.checked ? "full" : "selected")}
          className="mt-0.5 h-3.5 w-3.5 accent-[var(--primary)]"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <Files className="h-3.5 w-3.5 text-primary" />
            Quét toàn bộ bài
          </span>
          <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
            {mode === "quick"
              ? `Tất cả section trong bản thảo (tối đa 20 phần, hiện có ${sectionOptions.length}).`
              : `Tất cả section — MiniMax sâu (tối đa 8 phần, hiện có ${sectionOptions.length}).`}
          </span>
        </span>
      </label>

      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {logicAuditModeHint(mode, scope)}
      </p>

      {!auditFull ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {mode === "deep" ? "Chọn 1 phần" : "Chọn phần quét"}
            </span>
            {mode === "quick" ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-[10px] text-primary hover:underline"
                  onClick={() => setSelected(sectionOptions)}
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  className="text-[10px] text-primary hover:underline"
                  onClick={() => setSelected(defaultQuickSectionSelection(sectionOptions))}
                >
                  IMRAD mặc định
                </button>
              </div>
            ) : null}
          </div>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto soft-scrollbar">
            {sectionOptions.map((name) => {
              const active = selected.includes(name);
              const inputType = mode === "deep" ? "radio" : "checkbox";
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
                    type={inputType}
                    name="logic-audit-section"
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
          Sẽ quét <strong className="text-foreground">{sectionOptions.length}</strong> phần trong
          file LaTeX.
        </p>
      )}

      <button
        type="button"
        disabled={!canRun}
        onClick={() => onRun(mode, scope, auditFull ? [] : selected)}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        {loading
          ? "Đang audit…"
          : auditFull
            ? mode === "deep"
              ? "Chạy Deep · toàn bộ bài"
              : "Chạy Quick · toàn bộ bài"
            : mode === "deep"
              ? "Chạy Deep audit"
              : "Chạy Quick audit"}
      </button>

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
                <p className="mt-2 text-xs text-muted-foreground">Không có vấn đề rõ ràng.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {(section.conflicts ?? []).map((c) => (
                    <li key={c.id} className="text-xs">
                      <span className="font-medium text-[color:var(--editorial-red)]">
                            [{severityLabel(c.severity)}]
                      </span>{" "}
                      {c.comment}
                    </li>
                  ))}
                  {(section.weak_claims ?? []).map((w, i) => (
                    <li key={`weak-${i}`} className="text-xs text-muted-foreground">
                      [WEAK] {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {(report.cross_section_conflicts ?? []).map((cross, i) => (
            <div
              key={`cross-${i}`}
              className="rounded-md border border-dashed border-border/60 p-3 text-xs"
            >
              <span className="font-medium">Cross-section:</span> {cross.description}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Hoặc chat: &quot;/logic&quot; · &quot;/logic full&quot; · &quot;/logic deep&quot;.
        </p>
      )}
    </div>
  );
}
