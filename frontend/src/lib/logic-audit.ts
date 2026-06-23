import type { LatexOutlineItem } from "@/lib/latex-outline";

export type LogicAuditMode = "quick" | "deep";
export type LogicAuditScope = "selected" | "full";

export const LOGIC_AUDIT_QUICK_DEFAULTS = ["Abstract", "Introduction", "Conclusion"] as const;

export function listLogicAuditSectionOptions(outline: LatexOutlineItem[]): string[] {
  const names = new Set<string>();
  for (const item of outline) {
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
  return mode === "deep" ? "Deep (MiniMax M3)" : "Quick (OpenRouter)";
}

export function logicAuditModeHint(mode: LogicAuditMode, scope: LogicAuditScope = "selected"): string {
  if (scope === "full") {
    if (mode === "deep") {
      return "Quét toàn bộ bài (tối đa 8 phần) bằng MiniMax M3 — có thể mất 10–20 phút.";
    }
    return "Quét toàn bộ bài (tối đa 20 phần) bằng OpenRouter — thường ~5–10 phút.";
  }
  if (mode === "deep") {
    return "Soi sâu 1 phần bằng MiniMax M3 — ~3–5 phút. Không phụ thuộc provider chat.";
  }
  return "Quét nhanh 2–3 phần bằng OpenRouter — ~2–3 phút. Không phụ thuộc provider chat.";
}
