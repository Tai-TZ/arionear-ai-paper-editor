import { useEffect, useRef, useState } from "react";
import { Scale } from "lucide-react";

import { useLocale } from "@/components/locale-context";
import { toUserFacingMessage } from "@/lib/api/api-errors";
import {
  checkCitationRelevance,
  type CitationRelevanceItem,
  type CitationRelevanceResponse,
} from "@/lib/api/citation-relevance-api";
import {
  confidencePercent,
  countRelevanceVerdicts,
  relevanceBadgeClass,
  selectVerifiedCitationKeys,
} from "@/lib/citation-relevance";
import { citationRelevanceCopy, type CitationRelevanceCopy } from "@/lib/citation-relevance-i18n";

type CitationRelevancePanelProps = {
  projectId: string;
  /** Live main-file LaTeX — claims are read from it; the manuscript is never modified. */
  latex: string;
  /** Layer 1–3 verification results; only `verified` keys are sent for the relevance check. */
  citationResults: Record<string, unknown>[];
};

function RelevanceResultRow({
  item,
  t,
}: {
  item: CitationRelevanceItem;
  t: CitationRelevanceCopy;
}) {
  const judged = item.reason === "judged";
  return (
    <li className="rounded-md border border-border/50 bg-card px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${relevanceBadgeClass(item.verdict)}`}
        >
          {t.verdict[item.verdict]}
        </span>
        <span className="font-medium text-foreground">{item.key}</span>
        {judged ? (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {t.confidence(confidencePercent(item.confidence))}
          </span>
        ) : null}
      </div>
      {item.reason !== "judged" ? (
        <p className="mt-1 text-muted-foreground">{t.reason[item.reason]}</p>
      ) : item.rationale ? (
        <p className="mt-1 text-foreground/90">{item.rationale}</p>
      ) : null}
      {item.claim_snippets.map((snippet, index) => (
        <blockquote
          key={`${item.key}-claim-${index}`}
          className="mt-2 border-l-2 border-border pl-2 text-[11px] text-muted-foreground"
        >
          <span className="font-medium text-foreground/80">{t.claim}: </span>
          {snippet}
        </blockquote>
      ))}
      {item.source_title ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {t.source}: {item.source_title}
          {item.source ? ` · ${t.sourceLabel[item.source]}` : ""}
        </p>
      ) : null}
    </li>
  );
}

export function CitationRelevancePanel({
  projectId,
  latex,
  citationResults,
}: CitationRelevancePanelProps) {
  const { locale } = useLocale();
  const t = citationRelevanceCopy(locale);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<CitationRelevanceResponse | null>(null);
  const [verifiedTotal, setVerifiedTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const { keys, total } = selectVerifiedCitationKeys(citationResults);

  const handleRun = async () => {
    if (!projectId || !keys.length) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await checkCitationRelevance({
        sessionId: projectId,
        keys,
        latexContent: latex,
        locale,
        signal: controller.signal,
      });
      setResponse(result);
      setVerifiedTotal(total);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? toUserFacingMessage(err, locale) : t.error);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  const checkedCount = response?.results.length ?? 0;

  return (
    <div className="mt-4 rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Scale className="h-3.5 w-3.5 text-muted-foreground" />
          {t.title}
        </h3>
        <button
          type="button"
          onClick={handleRun}
          disabled={loading || !projectId || !keys.length}
          className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/15 disabled:opacity-50"
        >
          {loading ? t.running : t.run}
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t.intro}</p>
      {!keys.length ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{t.needsVerification}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {response ? (
        <>
          <p className="mt-2 text-xs text-foreground">
            {t.summary(countRelevanceVerdicts(response.results))}
          </p>
          {verifiedTotal > checkedCount ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t.capped(checkedCount, verifiedTotal)}
            </p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {response.results.map((item) => (
              <RelevanceResultRow key={item.key} item={item} t={t} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
