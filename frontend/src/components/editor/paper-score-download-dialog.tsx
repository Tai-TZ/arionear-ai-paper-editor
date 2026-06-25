import { Download } from "lucide-react";
import { useMemo } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaperScoreAuditAnimation } from "@/components/editor/paper-score-audit-animation";
import { useAnimatedNumber } from "@/hooks/use-animated-score";
import type { LogicAuditReport } from "@/lib/api/academic";
import {
  computePaperScore,
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
  compileError?: string | null;
  citationResults?: Record<string, unknown>[] | null;
  logicAuditReport?: LogicAuditReport | null;
  auditLoading?: boolean;
  auditProgress?: string | null;
  auditError?: string | null;
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
}: {
  dim: PaperScoreDimension;
  animate: boolean;
  index: number;
  pending?: boolean;
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
    </div>
  );
}

function ScoreSummaryPanel({
  scoreResult,
  gradeColor,
  agentScored,
}: {
  scoreResult: PaperScoreResult;
  gradeColor: string;
  agentScored: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <ScoreRing score={scoreResult.overall} animate />
      <p className="mt-4 font-sans-ui text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Điểm tổng
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
        {agentScored
          ? "Kết hợp phản biện AI, cấu trúc và trích dẫn."
          : "Cấu trúc, trích dẫn và kỹ thuật."}
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
  compileError = null,
  citationResults = null,
  logicAuditReport = null,
  auditLoading = false,
  auditProgress = null,
  auditError = null,
}: PaperScoreDownloadDialogProps) {
  const scoreResult: PaperScoreResult = useMemo(
    () =>
      computePaperScore({
        latex,
        hasPdf: Boolean(pdfData),
        compileError,
        citationResults,
        logicAuditReport,
        includeLogicReview: PAPER_PEER_REVIEW_ENABLED,
        auditPending: auditLoading,
      }),
    [latex, pdfData, compileError, citationResults, logicAuditReport, auditLoading],
  );

  const gradeColor = auditLoading ? "var(--muted-foreground)" : scoreColor(scoreResult.overall);
  const gateStaleWarning =
    auditError && scoreResult.agentScored && !auditLoading ? auditError : null;
  const summaryText =
    auditError && !scoreResult.agentScored && !auditLoading
      ? auditError
      : scoreResult.auditSummary;

  const hasCompileError = Boolean(compileError);

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
      <DialogContent className="paper-score-dialog gap-0 overflow-hidden border-2 border-foreground p-0 shadow-[8px_8px_0_0_rgba(0,0,0,0.08)] sm:rounded-none !fixed !left-1/2 !top-4 !z-50 !flex !h-auto !w-[calc(100%-1.5rem)] !max-w-[56rem] !-translate-x-1/2 !translate-y-0 max-h-[calc(100dvh-2rem)] flex-col [&>button.absolute]:right-4 [&>button.absolute]:top-4 [&>button.absolute]:z-10 [&>button.absolute]:rounded-md [&>button.absolute]:text-background [&>button.absolute]:opacity-90 [&>button.absolute]:hover:bg-background/15 [&>button.absolute]:hover:opacity-100">
        <div className="relative shrink-0 border-b border-background/15 bg-foreground px-6 py-5 pr-14 text-background">
          <p className="font-sans-ui text-[10px] uppercase tracking-[0.22em] text-background/60">
            Pre-publication gate
          </p>
          <DialogTitle className="mt-2 font-serif-display text-2xl font-bold tracking-tight text-background">
            Chấm điểm bài báo
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-2xl text-sm leading-relaxed text-background/75">
            Ario đánh giá bản thảo trước khi bạn xuất PDF — kết hợp phản biện AI và kiểm tra kỹ thuật.
            Điểm số mang tính gợi ý — quyết định cuối thuộc về tác giả.
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 bg-background">
          <div className="grid min-h-0 grid-cols-1 md:grid-cols-[minmax(220px,260px)_1fr]">
            {/* Left: score or audit animation */}
            <aside className="flex flex-col justify-center border-b border-border/50 bg-muted/20 px-6 py-6 md:border-b-0 md:border-r">
              {auditLoading ? (
                <PaperScoreAuditAnimation progress={auditProgress} />
              ) : (
                <ScoreSummaryPanel
                  scoreResult={scoreResult}
                  gradeColor={gradeColor}
                  agentScored={scoreResult.agentScored}
                />
              )}
            </aside>

            {/* Right: summary + criteria grid */}
            <main className="flex min-w-0 flex-col px-6 py-5">
              {hasCompileError && !auditLoading ? (
                <div className="mb-4 flex items-start gap-2.5 rounded border border-[color:var(--editorial-red,#b91c1c)]/30 bg-[color:var(--editorial-red,#b91c1c)]/5 px-4 py-3">
                  <span className="mt-0.5 shrink-0 text-[color:var(--editorial-red,#b91c1c)]" aria-hidden>✕</span>
                  <p className="text-xs leading-relaxed text-[color:var(--editorial-red,#b91c1c)]">
                    <span className="font-semibold">LaTeX compile lỗi</span> — sửa lỗi trước khi xuất bản để đảm bảo PDF chính xác.
                  </p>
                </div>
              ) : null}
              {summaryText && !auditLoading ? (
                <div className="mb-4 rounded border border-border/70 bg-card px-4 py-3">
                  <p className="font-sans-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {gateStaleWarning
                      ? "Tóm tắt phản biện"
                      : auditError && !scoreResult.agentScored
                        ? "Lưu ý"
                        : "Tóm tắt phản biện"}
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
                      Không cập nhật phản biện mới: {gateStaleWarning}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <p className="mb-3 font-sans-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Tiêu chí chấm điểm
              </p>
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded border border-border/70 bg-border/70 sm:grid-cols-2">
                {scoreResult.dimensions.map((dim, index) => (
                  <DimensionCard
                    key={dim.id}
                    dim={dim}
                    animate={open}
                    index={index}
                    pending={auditLoading && dim.id === "logic"}
                  />
                ))}
              </div>
            </main>
          </div>
        </div>

        <div className="shrink-0 border-t border-border/70 bg-muted/20 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {auditLoading
                ? "Ario đang đọc abstract, giới thiệu và kết luận — tiêu chí kỹ thuật bên phải sẵn sàng."
                : hasCompileError
                  ? "PDF đã sẵn sàng tải — nhưng khuyến nghị sửa lỗi compile trước."
                  : "Xuất PDF sau khi xem điểm. Chi tiết logic xem trong Logic Audit."}
            </p>
            <button
              type="button"
              disabled={!pdfData || auditLoading}
              onClick={handleDownload}
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 border border-foreground bg-foreground px-5 py-2.5 font-sans-ui text-[11px] uppercase tracking-[0.16em] text-background transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground sm:w-auto sm:min-w-[10.5rem]"
            >
              <Download className="h-4 w-4" aria-hidden />
              {auditLoading ? "Đang đánh giá…" : "Tải PDF"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
