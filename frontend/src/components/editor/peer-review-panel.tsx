import { useMemo } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Loader2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";

import { useLocale } from "@/components/locale-context";
import { usePeerReview } from "@/features/editor/state/usePeerReview";
import type { LLMProvider } from "@/lib/api/academic";
import {
  PEER_REVIEW_COMMENTS_MAX_LENGTH,
  PEER_REVIEW_COMMENTS_SOFT_LIMIT,
  REVIEW_TONES,
  type PeerReviewItem,
  type ReviewCategory,
  type ReviewTone,
} from "@/lib/api/peer-review-api";
import type { PeerReviewCopy } from "@/lib/peer-review-i18n";
import {
  countByCategory,
  groupItemsByReviewer,
  type PeerReviewItemEdit,
} from "@/lib/peer-review-letter";
import { cn } from "@/lib/utils";

type PeerReviewPanelProps = {
  projectId: string;
  latex: string;
  llmProvider?: LLMProvider;
  llmModel?: string;
};

const CATEGORY_CLASS: Record<ReviewCategory, string> = {
  major: "bg-destructive/15 text-destructive",
  minor: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  editorial: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  question: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
};

const CHIP = "rounded px-1.5 py-0.5 text-[10px] font-semibold";
const FIELD =
  "w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs leading-relaxed outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15";
const SECONDARY_BTN =
  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-50";

export function PeerReviewPanel({ projectId, latex, llmProvider, llmModel }: PeerReviewPanelProps) {
  const { locale } = useLocale();
  const review = usePeerReview({ projectId, latex, locale, llmProvider, llmModel });
  const { t, result } = review;
  const charCount = review.comments.length;

  const groups = useMemo(() => (result ? groupItemsByReviewer(result.items) : []), [result]);
  const counts = useMemo(() => (result ? countByCategory(result.items) : null), [result]);
  const needsInput = result ? result.items.filter((item) => item.needs_author_input).length : 0;

  const handleClear = () => {
    if (!review.comments.trim() && !result) return;
    if (window.confirm(t.clearConfirm)) review.clear();
  };

  return (
    <div className="peer-review-panel flex flex-col gap-4">
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-muted-foreground">{t.intro}</p>
        <p className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] leading-snug text-emerald-900 dark:text-emerald-200">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t.humanGate}</span>
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="peer-review-comments"
          className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
        >
          {t.commentsLabel}
        </label>
        <textarea
          id="peer-review-comments"
          className={cn(FIELD, "min-h-[160px] font-mono")}
          value={review.comments}
          onChange={(e) => review.setComments(e.target.value)}
          placeholder={t.commentsPlaceholder}
          maxLength={PEER_REVIEW_COMMENTS_MAX_LENGTH}
          disabled={review.loading}
          spellCheck={false}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span
            className={cn(
              charCount > PEER_REVIEW_COMMENTS_SOFT_LIMIT && "text-amber-700 dark:text-amber-300",
            )}
          >
            {t.charCount(charCount, PEER_REVIEW_COMMENTS_SOFT_LIMIT)}
            {charCount > PEER_REVIEW_COMMENTS_SOFT_LIMIT ? ` — ${t.overSoftLimit}` : ""}
          </span>
          <label className="flex items-center gap-1.5">
            <span>{t.toneLabel}</span>
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground"
              value={review.tone}
              onChange={(e) => review.setTone(e.target.value as ReviewTone)}
              disabled={review.loading}
            >
              {REVIEW_TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {t.tones[tone]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={review.draft}
          disabled={review.loading || !review.comments.trim()}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {review.loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {review.loading ? t.drafting : result ? t.redraft : t.draft}
        </button>
        {review.loading ? (
          <button
            type="button"
            onClick={review.cancel}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50"
          >
            <Square className="h-3 w-3 fill-current" />
            {t.cancel}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClear}
            disabled={!review.comments.trim() && !result}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            {t.clear}
          </button>
        )}
      </div>

      {review.loading ? (
        <p className="text-[11px] leading-snug text-muted-foreground" aria-live="polite">
          {t.draftingHint}
        </p>
      ) : null}

      {review.error ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {review.error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-4 border-t border-border/60 pt-4">
          {result.warnings.length || result.omitted_item_count ? (
            <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {result.warnings.map((warning) => (
                <li key={warning}>{t.warnings[warning]}</li>
              ))}
              {result.omitted_item_count ? (
                <li>{t.omittedItems(result.omitted_item_count)}</li>
              ) : null}
            </ul>
          ) : null}

          {result.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noItems}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t.itemCount(result.items.length)}
                </span>
                {counts
                  ? (Object.keys(counts) as ReviewCategory[])
                      .filter((category) => counts[category] > 0)
                      .map((category) => (
                        <span key={category} className={cn(CHIP, CATEGORY_CLASS[category])}>
                          {t.categories[category]} · {counts[category]}
                        </span>
                      ))
                  : null}
                {needsInput ? (
                  <span className="text-amber-700 dark:text-amber-300">
                    · {t.needsInputCount(needsInput)}
                  </span>
                ) : null}
              </div>

              <div className="space-y-2 rounded-lg border border-border/70 bg-card/60 p-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={SECONDARY_BTN} onClick={review.copyLetter}>
                    {review.copiedKey === "letter" ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {review.copiedKey === "letter" ? t.letterCopied : t.copyLetter}
                  </button>
                  <button type="button" className={SECONDARY_BTN} onClick={review.downloadMarkdown}>
                    <Download className="h-3 w-3" />
                    {t.downloadMd}
                  </button>
                  <button type="button" className={SECONDARY_BTN} onClick={review.downloadLatex}>
                    <Download className="h-3 w-3" />
                    {t.downloadTex}
                  </button>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[var(--primary)]"
                    checked={review.includeChanges}
                    onChange={(e) => review.setIncludeChanges(e.target.checked)}
                  />
                  {t.includeChanges}
                </label>
              </div>

              {groups.map((group) => (
                <section key={group.reviewer ?? "__general"} className="space-y-2">
                  <h3 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
                    {group.reviewer === null ? t.generalGroup : t.reviewer(group.reviewer)}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {t.itemCount(group.items.length)}
                    </span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {group.items.map((item) => (
                      <PeerReviewItemCard
                        key={item.id}
                        item={item}
                        t={t}
                        copied={review.copiedKey === item.id}
                        onEdit={(patch) => review.updateItem(item.id, patch)}
                        onCopy={() => void review.copyText(item.response, item.id)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PeerReviewItemCard({
  item,
  t,
  copied,
  onEdit,
  onCopy,
}: {
  item: PeerReviewItem;
  t: PeerReviewCopy;
  copied: boolean;
  onEdit: (patch: PeerReviewItemEdit) => void;
  onCopy: () => void;
}) {
  const responseId = `peer-review-response-${item.id}`;
  const changeId = `peer-review-change-${item.id}`;
  return (
    <li className="rounded-lg border border-border/70 bg-card/80 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className={cn(CHIP, "bg-muted text-muted-foreground font-mono")}>{item.id}</span>
        <span className={cn(CHIP, CATEGORY_CLASS[item.category])}>
          {t.categories[item.category]}
        </span>
        {item.needs_author_input ? (
          <span
            className={cn(CHIP, "bg-amber-500/15 text-amber-800 dark:text-amber-300")}
            title={t.needsInputHint}
          >
            {t.needsInput}
          </span>
        ) : null}
        {item.unverified_numbers.length ? (
          <span
            className={cn(
              CHIP,
              "inline-flex items-center gap-1 bg-destructive/10 text-destructive",
            )}
            title={t.checkNumbersHint}
          >
            <AlertTriangle className="h-3 w-3" />
            {t.checkNumbers(item.unverified_numbers.join(", "))}
          </span>
        ) : null}
        {!item.quote_verified ? (
          <span
            className={cn(CHIP, "bg-muted text-muted-foreground")}
            title={t.quoteUnverifiedHint}
          >
            {t.quoteUnverified}
          </span>
        ) : null}
        {item.draft_failed ? (
          <span
            className={cn(CHIP, "bg-destructive/15 text-destructive")}
            title={t.draftFailedHint}
          >
            {t.draftFailed}
          </span>
        ) : null}
      </div>

      {item.summary ? (
        <p className="mb-2 text-xs font-medium text-foreground">{item.summary}</p>
      ) : null}

      <blockquote className="mb-3 whitespace-pre-wrap border-l-2 border-border pl-3 text-xs italic leading-relaxed text-muted-foreground">
        {item.quote}
      </blockquote>

      <label
        htmlFor={responseId}
        className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {t.responseLabel}
      </label>
      <textarea
        id={responseId}
        className={cn(FIELD, "min-h-[96px]")}
        value={item.response}
        placeholder={item.draft_failed ? t.draftFailedHint : undefined}
        onChange={(e) => onEdit({ response: e.target.value })}
      />

      <label
        htmlFor={changeId}
        className="mb-1 mt-3 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {t.proposedChangeLabel}
      </label>
      <textarea
        id={changeId}
        className={cn(FIELD, "min-h-[56px]")}
        value={item.proposed_change}
        onChange={(e) => onEdit({ proposed_change: e.target.value })}
      />
      <p className="mt-1 text-[10px] text-muted-foreground">{t.proposedChangeHint}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={SECONDARY_BTN}
          onClick={onCopy}
          disabled={!item.response.trim()}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? t.copied : t.copyResponse}
        </button>
        {item.section_refs.length ? (
          <span className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            {t.sectionRefs}:
            {item.section_refs.map((ref) => (
              <span key={ref} className={cn(CHIP, "bg-secondary font-normal text-foreground")}>
                {ref}
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </li>
  );
}
