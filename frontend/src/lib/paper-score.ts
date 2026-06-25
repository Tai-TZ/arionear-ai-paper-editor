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
  /** One-line summary from logic audit agent, when available. */
  auditSummary?: string;
  /** Whether agent peer-review dimension is included in the score. */
  agentScored: boolean;
};

const IMRAD_CORE = ["abstract", "introduction", "methods", "results", "discussion", "conclusion"];

const SECTION_ALIASES: Record<string, string> = {
  // English variants
  methodology: "methods",
  "materials and methods": "methods",
  experiments: "results",
  "related work": "introduction",
  // Vietnamese
  "giới thiệu": "introduction",
  "phương pháp": "methods",
  "phương pháp nghiên cứu": "methods",
  "kết quả": "results",
  "thảo luận": "discussion",
  "kết luận": "conclusion",
  "tóm tắt": "abstract",
  // Short forms
  intro: "introduction",
  method: "methods",
  result: "results",
  concl: "conclusion",
};

const MIN_ABSTRACT_CHARS = 40;
const MIN_SECTION_CHARS = 50;
const MIN_SECTION_FILL_CHARS = 120;

function normalizeSectionName(name: string): string {
  const lower = name.trim().toLowerCase();
  return SECTION_ALIASES[lower] ?? lower;
}

function plainTextLen(text: string): number {
  return text.replace(/%.*$/gm, "").replace(/\\[a-zA-Z@]+(\[[^\]]*\])?(\{[^}]*\})?/g, "").trim().length;
}

function sectionContentLength(latex: string, sectionName: string): number {
  const re = new RegExp(
    `\\\\section\\*?\\{${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}(.*?)(?=\\\\section|\\\\end\\{document\\}|$)`,
    "is",
  );
  const match = re.exec(latex);
  if (!match) return 0;
  return plainTextLen(match[1]);
}

function imradCoreStatus(latex: string): { present: string[]; missing: string[] } {
  const body = latex.replace(/%.*$/gm, "");
  const present: string[] = [];
  const missing: string[] = [];

  for (const key of IMRAD_CORE) {
    if (key === "abstract") {
      const abstractMatch = /\\begin\{abstract\}(.*?)\\end\{abstract\}/is.exec(body);
      const len = plainTextLen(abstractMatch?.[1] ?? "");
      if (len >= MIN_ABSTRACT_CHARS) present.push(key);
      else missing.push(key);
      continue;
    }

    const sectionRe = /\\section\*?\{([^}]+)\}/gi;
    let matched = false;
    let match: RegExpExecArray | null;
    while ((match = sectionRe.exec(body)) !== null) {
      const norm = normalizeSectionName(match[1]);
      if (norm === key || norm.includes(key) || key.includes(norm)) {
        if (sectionContentLength(body, match[1]) >= MIN_SECTION_CHARS) {
          matched = true;
          break;
        }
      }
    }
    if (matched) present.push(key);
    else missing.push(key);
  }

  return { present, missing };
}

function scoreStructure(latex: string): PaperScoreDimension {
  const { present, missing } = imradCoreStatus(latex);
  const ratio = present.length / IMRAD_CORE.length;
  const score = Math.round(ratio * 100);
  return {
    id: "structure",
    label: "Cấu trúc IMRaD",
    score,
    hint:
      missing.length === 0
        ? "Đủ các phần cốt lõi IMRaD với nội dung tối thiểu."
        : `Thiếu hoặc quá ngắn: ${missing.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(", ")}.`,
  };
}

function scoreCompleteness(latex: string): PaperScoreDimension {
  const body = latex.replace(/%.*$/gm, "");
  const abstractMatch = /\\begin\{abstract\}(.*?)\\end\{abstract\}/is.exec(body);
  const abstractLen = plainTextLen(abstractMatch?.[1] ?? "");

  // Scan all actual sections in the document to count filled vs thin.
  // Uses normalizeSectionName so Vietnamese/aliased names are handled.
  const BODY_KEYS = new Set(["introduction", "methods", "results", "discussion", "conclusion"]);
  const sectionRe = /\\section\*?\{([^}]+)\}/gi;
  const seen = new Set<string>();
  let filledSections = 0;
  let totalBodySections = 0;

  let match: RegExpExecArray | null;
  while ((match = sectionRe.exec(body)) !== null) {
    const norm = normalizeSectionName(match[1]);
    const key = BODY_KEYS.has(norm)
      ? norm
      : [...BODY_KEYS].find((k) => norm.includes(k) || k.includes(norm));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    totalBodySections += 1;
    const len = sectionContentLength(body, match[1]);
    if (len >= MIN_SECTION_FILL_CHARS) filledSections += 1;
  }

  const abstractScore = abstractLen >= 80 ? 1 : abstractLen >= 30 ? 0.6 : abstractLen > 0 ? 0.3 : 0;
  const sectionScore = totalBodySections > 0 ? filledSections / Math.max(totalBodySections, 4) : 0;
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

function scoreLogicIntegrity(
  report?: LogicAuditReport | null,
  auditPending = false,
): PaperScoreDimension {
  if (auditPending) {
    return {
      id: "logic",
      label: "Mạch lập luận & phản biện",
      score: 0,
      hint: "Ario đang đọc lướt toàn bộ bài…",
    };
  }

  if (!report?.sections?.length) {
    return {
      id: "logic",
      label: "Mạch lập luận & phản biện",
      score: 45,
      hint: "Chưa có báo cáo phản biện — Ario sẽ phân tích khi mở dialog.",
    };
  }

  let critical = 0;
  let warning = 0;
  let weakCount = 0;
  for (const section of report.sections) {
    for (const conflict of section.conflicts ?? []) {
      if (conflict.severity === "critical") critical += 1;
      else if (conflict.severity === "warning") warning += 1;
    }
    weakCount += (section.weak_claims ?? []).length;
  }
  critical += (report.cross_section_conflicts ?? []).length;

  const penalty = critical * 18 + warning * 8 + weakCount * 4;
  const score = Math.max(0, Math.min(100, 100 - penalty));

  let hint: string;
  if (report.summary?.trim()) {
    hint = report.summary.trim();
  } else if (critical + warning + weakCount === 0) {
    hint = "Phản biện AI không phát hiện vấn đề logic nghiêm trọng ở các phần đã quét.";
  } else {
    const parts: string[] = [];
    if (critical) parts.push(`${critical} nghiêm trọng`);
    if (warning) parts.push(`${warning} cảnh báo`);
    if (weakCount) parts.push(`${weakCount} claim yếu`);
    hint = `Phản biện AI: ${parts.join(", ")}. Xem chi tiết trong Logic Audit.`;
  }

  return {
    id: "logic",
    label: "Mạch lập luận & phản biện",
    score,
    hint,
  };
}

function gradeFromScore(overall: number): { grade: string; gradeLabel: string } {
  if (overall >= 90) return { grade: "A", gradeLabel: "Xuất sắc" };
  if (overall >= 80) return { grade: "B", gradeLabel: "Tốt" };
  if (overall >= 70) return { grade: "C", gradeLabel: "Khá" };
  if (overall >= 60) return { grade: "D", gradeLabel: "Cần cải thiện" };
  return { grade: "F", gradeLabel: "Chưa đạt" };
}

/** Agent peer-review dimension is included in the publication gate score. */
export const PAPER_PEER_REVIEW_ENABLED = true;

export function computePaperScore(opts: {
  latex: string;
  hasPdf: boolean;
  compileError?: string | null;
  citationResults?: Record<string, unknown>[] | null;
  logicAuditReport?: LogicAuditReport | null;
  includeLogicReview?: boolean;
  auditPending?: boolean;
}): PaperScoreResult {
  const includeLogic = opts.includeLogicReview ?? PAPER_PEER_REVIEW_ENABLED;
  const auditPending = Boolean(opts.auditPending && includeLogic);

  const logicDim = includeLogic
    ? scoreLogicIntegrity(opts.logicAuditReport, auditPending)
    : null;

  const dimensions = [
    scoreStructure(opts.latex),
    scoreCompleteness(opts.latex),
    scoreCitations(opts.latex, opts.citationResults),
    ...(logicDim ? [logicDim] : []),
  ];

  const weights = includeLogic ? [0.2, 0.2, 0.2, 0.4] : [0.35, 0.35, 0.3];

  const scoredDimensions = auditPending
    ? dimensions.filter((d) => d.id !== "logic")
    : dimensions;
  const scoredWeights = auditPending ? weights.filter((_, i) => dimensions[i]?.id !== "logic") : weights;

  const weightSum = scoredWeights.reduce((a, b) => a + b, 0);
  const weighted =
    scoredDimensions.reduce((sum, dim, i) => sum + dim.score * scoredWeights[i], 0) / weightSum;
  // While audit is pending, show partial score from heuristic dimensions only
  // so the ring is informative rather than blank.
  const overall = Math.round(weighted);
  const { grade, gradeLabel } = auditPending
    ? { grade: "~", gradeLabel: "Đang đánh giá…" }
    : gradeFromScore(overall);

  const auditSummary = opts.logicAuditReport?.summary?.trim() || logicDim?.hint;

  return {
    overall,
    grade,
    gradeLabel,
    dimensions,
    auditSummary: includeLogic ? auditSummary : undefined,
    agentScored: includeLogic && !auditPending && Boolean(opts.logicAuditReport?.sections?.length),
  };
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
