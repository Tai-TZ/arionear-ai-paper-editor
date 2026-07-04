import type { LatexOutlineItem } from "@/lib/latex-outline";
import type { LogicAuditReport } from "@/lib/api/academic";
import type { ChatStreamProgressSnapshot } from "@/lib/chat-stream-progress";
import { findSectionOutlineLine } from "@/lib/structure-suggestions";

export type LogicAuditMode = "quick" | "deep";
export type LogicAuditScope = "selected" | "full";

export const LOGIC_AUDIT_QUICK_DEFAULTS = ["Abstract", "Introduction", "Conclusion"] as const;
export const LOGIC_AUDIT_QUICK_FULL_MAX = 20;
export const LOGIC_AUDIT_DEEP_FULL_MAX = 8;

export function listLogicAuditSectionOptions(outline: LatexOutlineItem[]): string[] {
  const names = new Set<string>();
  for (const item of outline) {
    if (item.kind === "subsection") continue;
    const label = item.label.trim();
    if (label) names.add(label);
  }
  if (!names.size) {
    return [...LOGIC_AUDIT_QUICK_DEFAULTS];
  }
  return Array.from(names);
}

export function defaultQuickSectionSelection(options: string[]): string[] {
  const picked: string[] = [];
  for (const key of LOGIC_AUDIT_QUICK_DEFAULTS) {
    const match = options.find((name) => name.toLowerCase().includes(key.toLowerCase()));
    if (match && !picked.includes(match)) picked.push(match);
  }
  if (picked.length) return picked;
  return options.slice(0, 3);
}

export function logicAuditModeLabel(mode: LogicAuditMode): string {
  return mode === "deep" ? "Deep" : "Quick";
}

export function logicAuditModeHint(mode: LogicAuditMode, scope: LogicAuditScope = "selected"): string {
  if (scope === "full") {
    if (mode === "deep") {
      return "Quét toàn bộ bài (tối đa 8 phần) bằng Gemini 3.5 Flash — có thể mất 8–15 phút.";
    }
    return "Quét toàn bộ bài (tối đa 20 phần) bằng Gemini 2.5 Flash — thường ~3–8 phút.";
  }
  if (mode === "deep") {
    return "Soi sâu 1 phần bằng Gemini 3.5 Flash — ~2–4 phút. Không phụ thuộc provider chat.";
  }
  return "Quét nhanh 2–3 phần bằng Gemini 2.5 Flash — ~1–2 phút. Không phụ thuộc provider chat.";
}

/** Client SSE timeout — must cover backend compute_logic_audit_timeout_sec (up to 900s). */
export function logicAuditClientTimeoutMs(
  mode: LogicAuditMode = "quick",
  scope: LogicAuditScope = "selected",
): number {
  const isFull = scope === "full";
  const isDeep = mode === "deep";
  if (isFull) return 900_000;
  if (isDeep) return 360_000;
  return 480_000;
}

export function isGateAuditReport(report: LogicAuditReport | null | undefined): boolean {
  return (report as { meta?: Record<string, unknown> } | null)?.meta?.audit_mode === "gate";
}

export function manuscriptHasCrossSectionPair(sectionNames: string[]): boolean {
  const lower = sectionNames.map((name) => name.toLowerCase());
  const hasAbstract = lower.some((name) => name.includes("abstract"));
  const hasConclusion = lower.some((name) => name.includes("conclusion"));
  return hasAbstract && hasConclusion;
}

export function logicAuditIncludesCrossSection(
  mode: LogicAuditMode,
  scope: LogicAuditScope,
  sectionNames: string[] = [],
): boolean {
  if (!manuscriptHasCrossSectionPair(sectionNames)) return false;
  if (mode === "deep") return true;
  return scope === "full";
}

export function logicAuditTargetSectionCount(
  mode: LogicAuditMode,
  scope: LogicAuditScope,
  selectedCount: number,
  availableCount: number,
  sectionNames: string[] = [],
): number {
  let count: number;
  if (scope === "full") {
    const cap = mode === "deep" ? LOGIC_AUDIT_DEEP_FULL_MAX : LOGIC_AUDIT_QUICK_FULL_MAX;
    count = Math.min(cap, Math.max(availableCount, 1));
  } else {
    count = Math.max(selectedCount, 1);
  }
  if (logicAuditIncludesCrossSection(mode, scope, sectionNames)) {
    count += 1;
  }
  return count;
}

export function mergeLogicSectionReport(
  report: LogicAuditReport | null,
  section: NonNullable<LogicAuditReport["sections"]>[number],
): LogicAuditReport {
  const base: LogicAuditReport = report ?? {
    sections: [],
    cross_section_conflicts: [],
  };
  const sections = [...(base.sections ?? [])];
  const idx = sections.findIndex((item) => item.section === section.section);
  if (idx >= 0) sections[idx] = section;
  else sections.push(section);
  return {
    ...base,
    sections,
    meta: {
      ...(base.meta ?? {}),
      auditing: true,
    },
  };
}

function isLogicAuditStepId(stepId: string): boolean {
  return (
    stepId.startsWith("logic-") ||
    /^s\d+-/.test(stepId) ||
    stepId.startsWith("cross-") ||
    stepId.startsWith("persona-")
  );
}

export function formatLogicAuditProgress(
  progress: ChatStreamProgressSnapshot | null | undefined,
): string | null {
  if (!progress?.steps?.length) return null;
  const active = [...progress.steps]
    .reverse()
    .find((step) => step.status === "active" && isLogicAuditStepId(step.id));
  if (!active) return null;
  return active.detail ? `${active.label} — ${active.detail}` : active.label;
}

function normalizeExcerpt(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Line number (1-based) of the first line containing a claim/evidence excerpt. */
export function findExcerptLine(latex: string, excerpt: string): number | null {
  const needle = excerpt.trim();
  if (!needle || needle.length < 8) return null;
  const lines = latex.split(/\r?\n/);
  const candidates = [
    needle.slice(0, 120),
    normalizeExcerpt(needle).slice(0, 80),
    normalizeExcerpt(needle).slice(0, 40),
  ].filter((part, index, arr) => part.length >= 8 && arr.indexOf(part) === index);

  for (const part of candidates) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(part) || normalizeExcerpt(line).includes(part)) {
        return i + 1;
      }
    }
  }
  return null;
}

export function resolveLogicIssueLine(
  latex: string,
  sectionName: string,
  excerpt?: string,
): number | null {
  const fromExcerpt = excerpt?.trim() ? findExcerptLine(latex, excerpt) : null;
  return fromExcerpt ?? findSectionOutlineLine(latex, sectionName);
}

export function buildLogicCrossSectionAskPrompt(description: string, section?: string): string {
  const issue = description.trim();
  const name = section?.trim() || "bài báo";
  return `/edit Làm rõ mâu thuẫn logic giữa các phần (${name}): ${issue}`;
}

export function buildLogicConflictAskPrompt(opts: {
  section: string;
  comment: string;
  claimText?: string;
}): string {
  const section = opts.section.trim() || "section";
  const issue = opts.comment.trim();
  const claim = opts.claimText?.trim();
  if (claim) {
    return `/edit Trong phần ${section}, làm rõ logic cho khẳng định: "${claim.slice(0, 200)}" — vấn đề: ${issue}`;
  }
  return `/edit Trong phần ${section}, cải thiện logic (chỉ sửa bản thảo, không thêm số liệu mới): ${issue}`;
}

export function buildLogicWeakClaimAskPrompt(section: string, weakClaim: string): string {
  const name = section.trim() || "section";
  const claim = weakClaim.trim();
  return `/edit Trong phần ${name}, củng cố khẳng định yếu: "${claim.slice(0, 200)}"`;
}
