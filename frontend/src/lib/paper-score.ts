import type { LogicAuditReport } from "@/lib/api/academic";

export type PaperScoreDimension = {
  id: string;
  label: string;
  score: number;
  hint: string;
};

export type PaperScoreResult = {
  overall: number;
  grade: string;
  gradeLabel: string;
  dimensions: PaperScoreDimension[];
};

const IMRAD_CORE = ["abstract", "introduction", "methods", "results", "discussion", "conclusion"];

const SECTION_ALIASES: Record<string, string> = {
  methodology: "methods",
  "materials and methods": "methods",
  experiments: "results",
  "related work": "introduction",
};

function normalizeSectionName(name: string): string {
  const lower = name.trim().toLowerCase();
  return SECTION_ALIASES[lower] ?? lower;
}

function extractSectionNames(latex: string): Set<string> {
  const names = new Set<string>();
  const abstract = /\\begin\{abstract\}/i.test(latex);
  if (abstract) names.add("abstract");

  const sectionRe = /\\section\*?\{([^}]+)\}/gi;
  let match: RegExpExecArray | null;
  while ((match = sectionRe.exec(latex)) !== null) {
    names.add(normalizeSectionName(match[1]));
  }
  return names;
}

function sectionContentLength(latex: string, sectionName: string): number {
  const re = new RegExp(
    `\\\\section\\*?\\{${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}(.*?)(?=\\\\section|\\\\end\\{document\\}|$)`,
    "is",
  );
  const match = re.exec(latex);
  if (!match) return 0;
  return match[1].replace(/%.*$/gm, "").replace(/\\[a-zA-Z@]+(\[[^\]]*\])?(\{[^}]*\})?/g, "").trim().length;
}

function scoreStructure(latex: string): PaperScoreDimension {
  const found = extractSectionNames(latex);
  const present = IMRAD_CORE.filter((s) => found.has(s) || [...found].some((n) => n.includes(s)));
  const ratio = present.length / IMRAD_CORE.length;
  const score = Math.round(ratio * 100);
  const missing = IMRAD_CORE.filter((s) => !present.includes(s));
  return {
    id: "structure",
    label: "Cấu trúc IMRaD",
    score,
    hint:
      missing.length === 0
        ? "Đủ các phần cốt lõi IMRaD."
        : `Thiếu: ${missing.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(", ")}.`,
  };
}

function scoreCompleteness(latex: string): PaperScoreDimension {
  const body = latex.replace(/%.*$/gm, "");
  const abstractMatch = /\\begin\{abstract\}(.*?)\\end\{abstract\}/is.exec(body);
  const abstractLen = abstractMatch?.[1]?.replace(/\\[a-zA-Z@]+(\[[^\]]*\])?(\{[^}]*\})?/g, "").trim().length ?? 0;

  let filledSections = 0;
  let totalSections = 0;
  for (const name of ["Introduction", "Methods", "Results", "Discussion", "Conclusion"]) {
    const len = sectionContentLength(body, name);
    if (len > 0) totalSections += 1;
    if (len >= 120) filledSections += 1;
  }

  const abstractScore = abstractLen >= 80 ? 1 : abstractLen >= 30 ? 0.6 : abstractLen > 0 ? 0.3 : 0;
  const sectionScore = totalSections > 0 ? filledSections / Math.max(totalSections, 4) : 0;
  const score = Math.round((abstractScore * 0.35 + sectionScore * 0.65) * 100);

  return {
    id: "completeness",
    label: "Độ đầy đủ nội dung",
    score,
    hint:
      score >= 75
        ? "Các phần chính có nội dung đáng kể."
        : "Một số section còn ngắn hoặc abstract chưa đủ chi tiết.",
  };
}

function scoreCitations(
  latex: string,
  citationResults?: Record<string, unknown>[] | null,
): PaperScoreDimension {
  const citeKeys = [...latex.matchAll(/\\cite[a-zA-Z*]*\{([^}]+)\}/g)].flatMap((m) =>
    m[1].split(",").map((k) => k.trim()).filter(Boolean),
  );
  const uniqueCites = new Set(citeKeys);

  if (citationResults?.length) {
    const verified = citationResults.filter((r) => r.status === "verified").length;
    const ratio = verified / citationResults.length;
    const score = Math.round(ratio * 100);
    return {
      id: "citations",
      label: "Trích dẫn",
      score,
      hint: `Đã xác minh ${verified}/${citationResults.length} nguồn trích dẫn.`,
    };
  }

  if (uniqueCites.size === 0) {
    return {
      id: "citations",
      label: "Trích dẫn",
      score: 40,
      hint: "Chưa phát hiện \\cite{} — cân nhắc thêm nguồn tham khảo.",
    };
  }

  const hasBib = /@\w+\s*\{/.test(latex);
  const score = hasBib ? 72 : 55;
  return {
    id: "citations",
    label: "Trích dẫn",
    score,
    hint: hasBib
      ? `${uniqueCites.size} cite key — chạy Citation verify để chấm chính xác hơn.`
      : `${uniqueCites.size} cite key nhưng chưa thấy BibTeX trong bản thảo.`,
  };
}

function scoreLogicIntegrity(report?: LogicAuditReport | null): PaperScoreDimension {
  if (!report?.sections?.length) {
    return {
      id: "logic",
      label: "Logic & phản biện",
      score: 50,
      hint: "Chưa có báo cáo phản biện — Ario sẽ phân tích khi mở dialog.",
    };
  }

  let critical = 0;
  let warning = 0;
  for (const section of report.sections) {
    for (const conflict of section.conflicts ?? []) {
      if (conflict.severity === "critical") critical += 1;
      else if (conflict.severity === "warning") warning += 1;
    }
  }
  critical += (report.cross_section_conflicts ?? []).length;

  const penalty = critical * 18 + warning * 8;
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return {
    id: "logic",
    label: "Logic & phản biện",
    score,
    hint:
      critical + warning === 0
        ? "Không phát hiện xung đột logic nghiêm trọng."
        : `${critical} vấn đề nghiêm trọng, ${warning} cảnh báo từ phản biện AI.`,
  };
}

function scoreReadiness(hasPdf: boolean, compileError: string | null): PaperScoreDimension {
  if (!hasPdf) {
    return {
      id: "readiness",
      label: "Sẵn sàng xuất bản",
      score: compileError ? 10 : 25,
      hint: compileError ? "Compile lỗi — sửa trước khi nộp." : "Chưa compile PDF — nhấn Compile trước.",
    };
  }
  return {
    id: "readiness",
    label: "Sẵn sàng xuất bản",
    score: 95,
    hint: "PDF compile thành công — sẵn sàng tải về.",
  };
}

function gradeFromScore(overall: number): { grade: string; gradeLabel: string } {
  if (overall >= 90) return { grade: "A", gradeLabel: "Xuất sắc" };
  if (overall >= 80) return { grade: "B", gradeLabel: "Tốt" };
  if (overall >= 70) return { grade: "C", gradeLabel: "Khá" };
  if (overall >= 60) return { grade: "D", gradeLabel: "Cần cải thiện" };
  return { grade: "F", gradeLabel: "Chưa đạt" };
}

/** Peer-review agent UI — off while Module_score ships without multi-agent review. */
export const PAPER_PEER_REVIEW_ENABLED = false;

export function computePaperScore(opts: {
  latex: string;
  hasPdf: boolean;
  compileError?: string | null;
  citationResults?: Record<string, unknown>[] | null;
  logicAuditReport?: LogicAuditReport | null;
  includeLogicReview?: boolean;
}): PaperScoreResult {
  const includeLogic = opts.includeLogicReview ?? PAPER_PEER_REVIEW_ENABLED;

  const dimensions = [
    scoreStructure(opts.latex),
    scoreCompleteness(opts.latex),
    scoreCitations(opts.latex, opts.citationResults),
    ...(includeLogic ? [scoreLogicIntegrity(opts.logicAuditReport)] : []),
    scoreReadiness(opts.hasPdf, opts.compileError ?? null),
  ];

  const weights = includeLogic
    ? [0.25, 0.2, 0.15, 0.25, 0.15]
    : [0.3, 0.25, 0.2, 0.25];
  const weighted =
    dimensions.reduce((sum, dim, i) => sum + dim.score * weights[i], 0) /
    weights.reduce((a, b) => a + b, 0);
  const overall = Math.round(weighted);
  const { grade, gradeLabel } = gradeFromScore(overall);

  return { overall, grade, gradeLabel, dimensions };
}

export type PeerReviewItem = {
  id: string;
  persona: string;
  section: string;
  severity: string;
  comment: string;
};

export function extractPeerReviewItems(report?: LogicAuditReport | null): PeerReviewItem[] {
  if (!report?.sections?.length) return [];

  const items: PeerReviewItem[] = [];
  for (const section of report.sections) {
    for (const conflict of section.conflicts ?? []) {
      const personas = conflict.persona_sources?.length
        ? conflict.persona_sources.join(", ")
        : "Phản biện";
      items.push({
        id: conflict.id,
        persona: personas,
        section: section.section,
        severity: conflict.severity,
        comment: conflict.comment,
      });
    }
    for (const weak of section.weak_claims ?? []) {
      items.push({
        id: `weak-${section.section}-${items.length}`,
        persona: "Critical reviewer",
        section: section.section,
        severity: "warning",
        comment: weak,
      });
    }
  }

  for (const [i, cross] of (report.cross_section_conflicts ?? []).entries()) {
    items.push({
      id: `cross-${i}`,
      persona: "Devil's advocate",
      section: "Cross-section",
      severity: "critical",
      comment: cross.description,
    });
  }

  return items;
}
