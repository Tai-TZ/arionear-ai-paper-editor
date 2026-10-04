import { AlertTriangle, Download } from "lucide-react";
import { useMemo } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/components/locale-context";
import { PaperScoreAuditAnimation } from "@/components/editor/paper-score-audit-animation";
import { AiDisclosureSection } from "@/components/editor/ai-disclosure-section";
import { useAnimatedNumber } from "@/hooks/use-animated-score";
import type { LogicAuditReport } from "@/lib/api/academic";
import { editorCopy } from "@/lib/editor-i18n";
import {
  computePaperScore,
  extractPeerReviewItems,
  PAPER_PEER_REVIEW_ENABLED,
  type PaperScoreDimension,
  type PaperScoreResult,
} from "@/lib/paper-score";

type PaperScoreDownloadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  latex: string;
  pdfData: Uint8Array | null;
  citationResults?: Record<string, unknown>[] | null;
  logicAuditReport?: LogicAuditReport | null;
  auditLoading?: boolean;
  auditProgress?: string | null;
  auditError?: string | null;
  onRetryAudit?: () => void;
  onOpenCitationsTab?: () => void;
  /** Server paper id; enables the AI disclosure section. */
  paperId?: string | null;
};

const ISSUE_SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function scoreColor(score: number): string {
  if (score >= 80) return "var(--editorial-green, #1a7f4b)";
  if (score >= 60) return "var(--editorial-amber, #b45309)";
  return "var(--editorial-red)";
}

function ScoreRing({ score, animate }: { score: number; animate: boolean }) {
  const displayScore = useAnimatedNumber(score, { enabled: animate, duration: 1000 });
  const radius = 54;
  const size = 148;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayScore / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative mx-auto flex h-[9.25rem] w-[9.25rem] shrink-0 items-center justify-center">
      <svg className="-rotate-90" width={size} height={size} aria-hidden>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-foreground/10"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-75 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="font-serif-display text-[2.5rem] font-bold leading-none tabular-nums tracking-tight"
          style={{ color }}
        >
          {displayScore}
        </span>
        <span className="mt-1 font-sans-ui text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}

function DimensionCard({
  dim,
  animate,
  index,
  pending,
  actionLabel,
  onAction,
}: {
  dim: PaperScoreDimension;
  animate: boolean;
  index: number;
  pending?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const displayScore = useAnimatedNumber(dim.score, {
    enabled: animate && !pending,
    duration: 850,
    delay: 120 + index * 70,
  });
  const color = pending ? "var(--muted-foreground)" : scoreColor(dim.score);

  return (
    <div className="flex h-full flex-col bg-card px-4 py-3.5">
      <div className="mb-2 flex items-start justify-between gap-3">
        <span className="text-[12px] font-medium leading-snug text-foreground">{dim.label}</span>
        <span className="shrink-0 font-mono text-sm tabular-nums" style={{ color }}>
          {pending ? "…" : displayScore}
        </span>
      </div>
      <div className="h-[3px] overflow-hidden rounded-full bg-foreground/[0.08]">
        <div
          className="h-full rounded-full transition-[width] duration-75 ease-out"
          style={{
            width: pending ? "0%" : `${displayScore}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <p className="mt-2 line-clamp-3 flex-1 text-[11px] leading-relaxed text-muted-foreground">
        {dim.hint}
      </p>
      {onAction && actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 self-start font-sans-ui text-[10px] uppercase tracking-[0.12em] text-foreground/70 underline underline-offset-2 hover:text-foreground"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function ScoreSummaryPanel({
  scoreResult,
  gradeColor,
  agentScored,
  t,
}: {
  scoreResult: PaperScoreResult;
  gradeColor: string;
  agentScored: boolean;
  t: ReturnType<typeof editorCopy>["scoreGate"];
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <ScoreRing score={scoreResult.overall} animate />
      <p className="mt-4 font-sans-ui text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {t.totalScore}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <span
          className="inline-flex items-center rounded border px-2 py-0.5 font-sans-ui text-xs font-semibold uppercase tracking-widest"
          style={{ borderColor: gradeColor, color: gradeColor }}
        >
          {scoreResult.grade}
        </span>
        <span className="text-sm text-foreground/80">{scoreResult.gradeLabel}</span>
      </div>
      <p className="mt-3 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
        {agentScored ? t.withAgent : t.heuristicOnly}
      </p>
    </div>
  );
}

export function PaperScoreDownloadDialog({
  open,
  onOpenChange,
  projectName,
  latex,
  pdfData,
  citationResults = null,
  logicAuditReport = null,
  auditLoading = false,
  auditProgress = null,
  auditError = null,
  onRetryAudit,
  onOpenCitationsTab,
  paperId = null,
}: PaperScoreDownloadDialogProps) {
  const { locale } = useLocale();
  const t = editorCopy(locale).scoreGate;

  const scoreResult: PaperScoreResult = useMemo(
    () =>
      computePaperScore({
        latex,
        citationResults,
        logicAuditReport,
        includeLogicReview: PAPER_PEER_REVIEW_ENABLED,
        auditPending: auditLoading,
        locale,
      }),
    [latex, citationResults, logicAuditReport, auditLoading, locale],
  );

  const gradeColor = auditLoading ? "var(--muted-foreground)" : scoreColor(scoreResult.overall);
  const gateStaleWarning =
    auditError && scoreResult.agentScored && !auditLoading ? auditError : null;
  const summaryText =
    auditError && !scoreResult.agentScored && !auditLoading ? null : scoreResult.auditSummary;

  const citationsUnverified = !citationResults?.length;

  const topIssues = useMemo(() => {
    if (!logicAuditReport || auditLoading) return [];
    return extractPeerReviewItems(logicAuditReport)
      .filter((item) => item.severity === "critical" || item.severity === "warning")
      .sort(
        (a, b) => (ISSUE_SEVERITY_ORDER[a.severity] ?? 9) - (ISSUE_SEVERITY_ORDER[b.severity] ?? 9),
      )
      .slice(0, 3);
  }, [logicAuditReport, auditLoading]);

  const handleOpenCitations = () => {
    if (!onOpenCitationsTab) return;
    onOpenChange(false);
    onOpenCitationsTab();
  };

  const handleDownload = () => {
    if (!pdfData || auditLoading) return;
    const blob = new Blob([pdfData.slice()], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${projectName.replace(/\s+/g, "-").toLowerCase() || "document"}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="paper-score-dialog gap-0 overflow-hidden border-2 border-foreground p-0 shadow-[8px_8px_0_0_rgba(0,0,0,0.08)] sm:rounded-none !fixed !left-1/2 !top-1/2 !z-50 !flex !h-auto !w-[calc(100%-1.5rem)] !max-w-[56rem] !-translate-x-1/2 !-translate-y-1/2 max-h-[calc(100dvh-2rem)] flex-col [&>button.absolute]:right-4 [&>button.absolute]:top-4 [&>button.absolute]:z-10 [&>button.absolute]:rounded-md [&>button.absolute]:text-background [&>button.absolute]:opacity-90 [&>button.absolute]:hover:bg-background/15 [&>button.absolute]:hover:opacity-100">
        <div className="relative shrink-0 border-b border-background/15 bg-foreground px-6 py-5 pr-14 text-background">
          <p className="font-sans-ui text-[10px] uppercase tracking-[0.22em] text-background/60">
            {t.eyebrow}
          </p>
          <DialogTitle className="mt-2 font-serif-display text-2xl font-bold tracking-tight text-background">
            {t.title}
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-2xl text-sm leading-relaxed text-background/75">
            {t.description}
          </DialogDescription>
          <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-background/55">
            {t.gatePeerReviewNote}
          </p>
        </div>

        {auditError ? (
          <div className="shrink-0 flex items-start gap-2.5 border-b border-[color:var(--editorial-amber,#b45309)]/30 bg-[color:var(--editorial-amber,#b45309)]/8 px-6 py-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--editorial-amber,#b45309)]"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-relaxed text-[color:var(--editorial-amber,#b45309)]">
                <span className="font-semibold">{t.errorTitle}: </span>
                {auditError}
              </p>
              {!auditLoading && onRetryAudit ? (
                <button
                  type="button"
                  onClick={onRetryAudit}
                  className="mt-2 font-sans-ui text-[10px] uppercase tracking-[0.14em] text-[color:var(--editorial-amber,#b45309)] underline underline-offset-2 hover:no-underline"
                >
                  {t.retryAudit}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:flex-row">
          <aside className="flex shrink-0 flex-col justify-center border-b border-border/50 bg-muted/20 px-6 py-6 md:w-[min(260px,34%)] md:border-b-0 md:border-r md:self-stretch">
            {auditLoading ? (
              <PaperScoreAuditAnimation
                progress={auditProgress}
                label={t.auditAnimationLabel}
                phrases={t.auditPhrases}
              />
            ) : (
              <ScoreSummaryPanel
                scoreResult={scoreResult}
                gradeColor={gradeColor}
                agentScored={scoreResult.agentScored}
                t={t}
              />
            )}
          </aside>

          <main className="paper-score-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {scoreResult.isPlaceholderTemplate && !auditLoading ? (
              <div className="mb-4 flex items-start gap-2.5 rounded border border-[color:var(--editorial-amber,#b45309)]/35 bg-[color:var(--editorial-amber,#b45309)]/8 px-4 py-3">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--editorial-amber,#b45309)]"
                  aria-hidden
                />
                <p className="text-xs leading-relaxed text-[color:var(--editorial-amber,#b45309)]">
                  {t.templateBanner}
                </p>
              </div>
            ) : null}

            {summaryText && !auditLoading ? (
              <div className="mb-4 rounded border border-border/70 bg-card px-4 py-3">
                <p className="font-sans-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {auditError && !scoreResult.agentScored ? t.note : t.reviewSummary}
                </p>
                <p
                  className={`mt-1.5 text-sm leading-relaxed ${
                    auditError && !scoreResult.agentScored
                      ? "text-[color:var(--editorial-amber,#b45309)]"
                      : "text-foreground/85"
                  }`}
                >
                  {summaryText}
                </p>
                {gateStaleWarning ? (
                  <p className="mt-2 text-xs leading-relaxed text-[color:var(--editorial-amber,#b45309)]">
                    {t.staleWarning} {gateStaleWarning}
                  </p>
                ) : null}
              </div>
            ) : null}

            {topIssues.length > 0 ? (
              <div className="mb-4 rounded border border-border/70 bg-card px-4 py-3">
                <p className="font-sans-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {t.topIssues}
                </p>
                <ul className="mt-2 space-y-2">
                  {topIssues.map((issue) => (
                    <li key={issue.id} className="text-xs leading-relaxed text-foreground/85">
                      <span
                        className={`mr-1.5 font-semibold uppercase ${
                          issue.severity === "critical"
                            ? "text-[color:var(--editorial-red,#b91c1c)]"
                            : "text-[color:var(--editorial-amber,#b45309)]"
                        }`}
                      >
                        {issue.section}
                      </span>
                      {issue.comment}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="mb-3 font-sans-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t.criteria}
            </p>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded border border-border/70 bg-border/70 sm:grid-cols-2">
              {scoreResult.dimensions.map((dim, index) => (
                <DimensionCard
                  key={dim.id}
                  dim={dim}
                  animate={open}
                  index={index}
                  pending={auditLoading && dim.id === "logic"}
                  actionLabel={
                    dim.id === "citations" && citationsUnverified && onOpenCitationsTab
                      ? t.openCitations
                      : undefined
                  }
                  onAction={
                    dim.id === "citations" && citationsUnverified && onOpenCitationsTab
                      ? handleOpenCitations
                      : undefined
                  }
                />
              ))}
            </div>

            {paperId ? <AiDisclosureSection key={paperId} paperId={paperId} /> : null}
          </main>
        </div>

        <div className="shrink-0 border-t border-border/70 bg-muted/20 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {auditLoading ? t.footerLoading : t.footerReady}
            </p>
            <button
              type="button"
              disabled={!pdfData || auditLoading}
              onClick={handleDownload}
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 border border-foreground bg-foreground px-5 py-2.5 font-sans-ui text-[11px] uppercase tracking-[0.16em] text-background transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground sm:w-auto sm:min-w-[10.5rem]"
            >
              <Download className="h-4 w-4" aria-hidden />
              {auditLoading ? t.evaluating : t.downloadBtn}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
