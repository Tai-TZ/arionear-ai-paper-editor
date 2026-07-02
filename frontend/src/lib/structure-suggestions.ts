import { parseLatexOutline } from "@/lib/latex-outline";

export type StructureSuggestion = {
  type?: string;
  section?: string;
  message?: string;
  severity?: string;
};

export function findSectionOutlineLine(latex: string, sectionName: string): number | null {
  const target = sectionName.trim().toLowerCase();
  if (!target) return null;
  const items = parseLatexOutline(latex);
  const exact = items.find((item) => item.label.trim().toLowerCase() === target);
  if (exact) return exact.line;
  const partial = items.find(
    (item) =>
      item.label.trim().toLowerCase().includes(target) ||
      target.includes(item.label.trim().toLowerCase()),
  );
  return partial?.line ?? null;
}

/** Prefill slash command for a structure suggestion. */
export function buildStructureAskPrompt(suggestion: StructureSuggestion): string {
  const section = (suggestion.section ?? "").trim() || "bài báo";
  const detail = (suggestion.message ?? "").trim();
  const type = (suggestion.type ?? "").toLowerCase();

  if (type === "missing") {
    return `/template Thêm section ${section} theo khung IMRAD`;
  }
  if (type === "length") {
    return `/edit Mở rộng phần ${section} cho đủ nội dung học thuật${detail ? `: ${detail}` : ""}`;
  }
  if (type === "misplaced") {
    return `/edit Sắp xếp lại cấu trúc phần ${section}${detail ? ` — ${detail}` : ""}`;
  }
  return `/structure ${detail || `Cải thiện phần ${section}`}`;
}

export function buildEditRedoPrompt(opts: {
  section?: string;
  description?: string;
  scope?: string;
}): string {
  const section = opts.section?.trim();
  const hint = opts.description?.trim() || opts.scope?.trim();
  const target = section ? `phần ${section}` : "gợi ý trước";
  return `/edit Thử lại ${target}${hint ? ` — ${hint}` : ""}. Lần trước chưa ổn, hãy chỉnh theo ý tôi: `;
}
