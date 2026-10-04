import type { LogicAuditReport } from "@/lib/api/academic";
import { streamChat } from "@/lib/api/academic";
import type { LLMProvider } from "@/lib/api/academic";
import { contentFingerprint } from "@/lib/pending-edit-utils";

// ---------------------------------------------------------------------------
// Fingerprint — stable identifier for a latex document state
// ---------------------------------------------------------------------------

export function logicAuditFingerprint(latex: string): string {
  return contentFingerprint(latex);
}

/** Client timeout — backend gate default is 120s; add buffer for network/SSE. */
export const SCORE_GATE_AUDIT_TIMEOUT_MS = 135_000;

// ---------------------------------------------------------------------------
// Report usability checks
// ---------------------------------------------------------------------------

/**
 * Returns true when `report` has at least one section result.
 * When `requireGateMode` is true, also requires `meta.audit_mode === "gate"`
 * so that reports produced by the full Logic Audit panel (which may be
 * scoped differently) are not reused as a gate result.
 */
export function hasUsableLogicAuditReport(
  report: LogicAuditReport | null | undefined,
  requireGateMode = false,
): boolean {
  if (!report?.sections?.length) return false;
  if (requireGateMode) {
    return (report as { meta?: Record<string, unknown> }).meta?.audit_mode === "gate";
  }
  return true;
}

/**
 * Returns true when the gate should run a fresh audit before showing the
 * score — i.e. when there is no usable gate report, or when the document
 * has changed since the last audit run.
 */
export function needsScoreGateAudit(
  latex: string,
  report: LogicAuditReport | null | undefined,
  lastFingerprint: string | null,
): boolean {
  if (!hasUsableLogicAuditReport(report, true)) return true;
  if (!lastFingerprint) return true;
  return logicAuditFingerprint(latex) !== lastFingerprint;
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

export function formatPaperScoreGateError(raw: string, locale: "en" | "vi" = "vi"): string {
  const lower = raw.toLowerCase();
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401")) {
    return locale === "en"
      ? `API key error — check provider configuration in Settings. (${raw})`
      : `Lỗi API key — kiểm tra cấu hình provider trong Settings. (${raw})`;
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return locale === "en"
      ? "AI review timed out — try again or use a shorter manuscript."
      : "Quá thời gian phản biện — thử lại hoặc chọn bài ngắn hơn.";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return locale === "en"
      ? "API rate limit — wait a few seconds and try again."
      : "Vượt giới hạn API — đợi vài giây rồi mở lại dialog.";
  }
  return (
    raw || (locale === "en" ? "Could not run AI peer review." : "Không thể chạy phản biện AI.")
  );
}

// ---------------------------------------------------------------------------
// Gate audit runner
// ---------------------------------------------------------------------------

export interface ScoreGateAuditOptions {
  latex: string;
  sessionId: string;
  integrityStrictness?: "relaxed" | "standard" | "strict";
  llmProvider?: LLMProvider;
  llmModel?: string;
  locale?: "en" | "vi";
  signal?: AbortSignal;
  onProgress?: (label: string) => void;
}

/**
 * Runs a lightweight "gate" mode logic audit scoped to abstract, intro and
 * conclusion — fast enough to run at export time.
 *
 * The resulting report carries `meta.audit_mode = "gate"` so the score dialog
 * can distinguish it from a full panel audit.
 */
export async function runQuickLogicAuditForScore(
  opts: ScoreGateAuditOptions,
): Promise<LogicAuditReport | null> {
  const {
    latex,
    sessionId,
    integrityStrictness = "standard",
    llmProvider,
    llmModel,
    locale = "vi",
    signal,
    onProgress,
  } = opts;

  const latexHash = logicAuditFingerprint(latex);

  return new Promise<LogicAuditReport | null>((resolve, reject) => {
    let settled = false;
    let result: LogicAuditReport | null = null;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const onAbort = () => settle(() => resolve(null));
    signal?.addEventListener("abort", onAbort, { once: true });

    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    const callbacks = {
      onActivity: (text: string) => {
        if (onProgress) onProgress(text);
      },
      onState: (state: { label?: string; status?: string }) => {
        if (onProgress && state.label) onProgress(state.label);
      },
      onLogicSection: (section: NonNullable<LogicAuditReport["sections"]>[number]) => {
        if (!result) {
          result = { sections: [], cross_section_conflicts: [], meta: { audit_mode: "gate" } };
        }
        result = {
          ...result,
          sections: [...(result.sections ?? []), section],
        };
      },
      onReasoning: () => {},
      onToken: () => {},
      onDone: (chatResult: { logic_audit_report?: LogicAuditReport }) => {
        cleanup();
        if (chatResult.logic_audit_report?.sections?.length) {
          settle(() =>
            resolve({
              ...chatResult.logic_audit_report,
              meta: {
                ...(chatResult.logic_audit_report!.meta ?? {}),
                audit_mode: "gate",
              },
            }),
          );
        } else if (result?.sections?.length) {
          settle(() => resolve(result));
        } else {
          settle(() => resolve(null));
        }
      },
      onError: (message: string) => {
        cleanup();
        settle(() => reject(new Error(message)));
      },
    };

    streamChat(
      locale === "en" ? "Skim manuscript" : "Đọc lướt bài báo",
      {
        sessionId,
        latexContent: latex,
        latexContentHash: latexHash,
        locale,
        task: "logic",
        logic_audit_mode: "gate",
        logic_audit_scope: "selected",
        logic_audit_sections: [],
        integrity_strictness: integrityStrictness,
        ...(llmProvider ? { llm_provider: llmProvider } : {}),
        ...(llmModel ? { llm_model: llmModel } : {}),
      },
      callbacks,
      signal,
    )
      .then(() => {
        if (!settled && !signal?.aborted) {
          settle(() => reject(new Error("Stream ended before peer review completed.")));
        }
      })
      .catch((err: unknown) => {
        cleanup();
        if (signal?.aborted) return;
        settle(() => reject(err instanceof Error ? err : new Error(String(err))));
      });
  });
}
