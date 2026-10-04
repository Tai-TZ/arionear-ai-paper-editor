import {
  CITATION_RELEVANCE_MAX_KEYS,
  type CitationRelevanceItem,
  type CitationRelevanceVerdict,
} from "@/lib/api/citation-relevance-api";

export const RELEVANCE_VERDICTS: readonly CitationRelevanceVerdict[] = [
  "supports",
  "partial",
  "unrelated",
  "insufficient_info",
];

/** Verified cite keys (verification order, de-duplicated) capped to the per-request limit. */
export function selectVerifiedCitationKeys(
  results: Record<string, unknown>[],
  max: number = CITATION_RELEVANCE_MAX_KEYS,
): { keys: string[]; total: number } {
  const verified: string[] = [];
  for (const result of results) {
    if (result.status !== "verified") continue;
    const key = typeof result.key === "string" ? result.key.trim() : "";
    if (key && !verified.includes(key)) verified.push(key);
  }
  return { keys: verified.slice(0, Math.max(0, max)), total: verified.length };
}

export function countRelevanceVerdicts(
  items: CitationRelevanceItem[],
): Record<CitationRelevanceVerdict, number> {
  const counts: Record<CitationRelevanceVerdict, number> = {
    supports: 0,
    partial: 0,
    unrelated: 0,
    insufficient_info: 0,
  };
  for (const item of items) {
    if (item.verdict in counts) counts[item.verdict] += 1;
  }
  return counts;
}

export function relevanceBadgeClass(verdict: CitationRelevanceVerdict): string {
  switch (verdict) {
    case "supports":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "partial":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "unrelated":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Confidence 0..1 → whole percent, clamped. */
export function confidencePercent(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100);
}
