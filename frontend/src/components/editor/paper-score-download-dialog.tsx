import { Download } from "lucide-react";
import { useMemo } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAnimatedNumber } from "@/hooks/use-animated-score";
import type { LogicAuditReport } from "@/lib/api/academic";
import {
  computePaperScore,
  PAPER_PEER_REVIEW_ENABLED,
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
};

function scoreColor(score: number): string {
  if (score >= 80) return "var(--editorial-green, #1a7f4b)";
  if (score >= 60) return "var(--editorial-amber, #b45309)";
  return "var(--editorial-red)";
}

function ScoreRing({ score, animate }: { score: number; animate: boolean }) {
  const displayScore = useAnimatedNumber(score, { enabled: animate, duration: 1000 });
  const radius = 52;
  const size = 140;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayScore / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative flex h-[8.75rem] w-[8.75rem] shrink-0 items-center justify-center">
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
          className="font-serif-display text-[2.35rem] font-bold leading-none tabular-nums tracking-tight"
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

function DimensionRow({
  label,
  score,
  hint,
  animate,
  index,
}: {
  label: string;
  score: number;
  hint: string;
  animate: boolean;
  index: number;
}) {
  const displayScore = useAnimatedNumber(score, {
    enabled: animate,
    duration: 850,
    delay: 120 + index * 90,
  });
  const color = scoreColor(score);

  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="mb-2.5 flex items-baseline justify-between gap-4">
        <span className="text-[13px] font-medium leading-snug text-foreground">{label}</span>
        <span className="shrink-0 font-mono text-sm tabular-nums" style={{ color }}>
          {displayScore}
        </span>
      </div>
      <div className="h-[3px] overflow-hidden rounded-full bg-foreground/[0.08]">
        <div
          className="h-full rounded-full transition-[width] duration-75 ease-out"
          style={{ width: `${displayScore}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
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
      }),
    [latex, pdfData, compileError, citationResults, logicAuditReport],
  );

  const gradeColor = scoreColor(scoreResult.overall);

  const handleDownload = () => {
    if (!pdfData) return;
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
      <DialogContent className="paper-score-dialog gap-0 overflow-hidden border-2 border-foreground p-0 shadow-[8px_8px_0_0_rgba(0,0,0,0.08)] sm:rounded-none !fixed !left-1/2 !top-4 !z-50 !flex !h-auto !w-[calc(100%-2rem)] !max-w-[32rem] !-translate-x-1/2 !translate-y-0 max-h-[calc(100dvh-2rem)] flex-col [&>button.absolute]:right-4 [&>button.absolute]:top-4 [&>button.absolute]:z-10 [&>button.absolute]:rounded-md [&>button.absolute]:text-background [&>button.absolute]:opacity-90 [&>button.absolute]:hover:bg-background/15 [&>button.absolute]:hover:opacity-100">
        <div className="relative shrink-0 border-b border-background/15 bg-foreground px-5 py-5 pr-12 text-background sm:pr-14">
          <p className="font-sans-ui text-[10px] uppercase tracking-[0.22em] text-background/60">
            Pre-publication gate
          </p>
          <DialogTitle className="mt-2 font-serif-display text-2xl font-bold tracking-tight text-background">
            Chấm điểm bài báo
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed text-background/75">
            Ario đánh giá bản thảo trước khi bạn xuất PDF. Điểm số mang tính gợi ý — quyết định cuối thuộc về tác giả.
          </DialogDescription>
        </div>

        <div className="paper-score-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background">
          {/* Score summary band */}
          <div className="flex items-center gap-5 border-b border-border/50 bg-muted/25 px-5 py-5">
            <ScoreRing score={scoreResult.overall} animate={open} />
            <div className="min-w-0 flex-1">
              <p className="font-sans-ui text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Điểm tổng
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center rounded border px-2 py-0.5 font-sans-ui text-xs font-semibold uppercase tracking-widest"
                  style={{ borderColor: gradeColor, color: gradeColor }}
                >
                  {scoreResult.grade}
                </span>
                <span className="text-sm text-foreground/80">{scoreResult.gradeLabel}</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Dựa trên cấu trúc IMRaD, nội dung, trích dẫn và khả năng xuất PDF.
              </p>
            </div>
          </div>

          {/* Criteria list */}
          <div className="px-5 pt-4 pb-5">
            <p className="mb-3 font-sans-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Tiêu chí chấm điểm
            </p>
            <div className="overflow-hidden rounded border border-border/70 bg-card shadow-[0_1px_0_rgba(0,0,0,0.04)]">
              <div className="divide-y divide-border/60">
                {scoreResult.dimensions.map((dim, index) => (
                  <DimensionRow
                    key={dim.id}
                    label={dim.label}
                    score={dim.score}
                    hint={dim.hint}
                    animate={open}
                    index={index}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border/70 bg-muted/20 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Xuất PDF sau khi xem điểm. Bạn vẫn có thể quay lại chỉnh sửa bất cứ lúc nào.
            </p>
            <button
              type="button"
              disabled={!pdfData}
              onClick={handleDownload}
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 border border-foreground bg-foreground px-5 py-2.5 font-sans-ui text-[11px] uppercase tracking-[0.16em] text-background transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground sm:w-auto sm:min-w-[10.5rem]"
            >
              <Download className="h-4 w-4" aria-hidden />
              Tải PDF
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
