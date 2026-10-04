import { useEffect, useMemo, useRef } from "react";

import type { ChatAiStep } from "@/lib/api/academic";
import { filterDisplaySteps } from "@/lib/api/academic";

const LINE_HEIGHT_PX = 28;
const VISIBLE_LINES = 3;
const GENERIC_STATUS = /^(đang xử lý|processing)/i;

type AiLoadingStateProps = {
  steps?: ChatAiStep[];
  activities?: string[];
  activity?: string | null;
  waitElapsedSec?: number | null;
  /** Compact layout for the dock progress strip */
  compact?: boolean;
};

function computeProgress(steps: ChatAiStep[]): number {
  const display = filterDisplaySteps(steps);
  if (!display.length) return 12;
  const done = display.filter((s) => s.status === "done").length;
  const hasActive = display.some((s) => s.status === "active");
  const total = done + (hasActive ? 1 : 0);
  if (total <= 0) return 12;
  const ratio = hasActive ? (done + 0.35) / total : 1;
  return Math.min(100, Math.max(12, Math.round(ratio * 100)));
}

function resolveStatus(steps: ChatAiStep[], activity: string | null | undefined): string {
  const display = filterDisplaySteps(steps);
  const active = display.find((s) => s.status === "active");
  if (active) return active.label;

  const trimmed = activity?.trim();
  if (trimmed && !GENERIC_STATUS.test(trimmed)) {
    return trimmed.replace(/…+$/, "");
  }

  const lastDone = [...display].reverse().find((s) => s.status === "done");
  if (lastDone) return lastDone.label;

  return "Đang kiểm tra bài viết";
}

const RING_RADIUS = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function LoadingAnimation({ progress }: { progress: number }) {
  const arc = Math.max(0.04, progress / 100) * RING_CIRCUMFERENCE;
  return (
    <div className="ai-loading-spinner" aria-hidden>
      <svg
        aria-label={`Tiến trình: ${Math.round(progress)}%`}
        className="ai-loading-spinner-svg"
        fill="none"
        viewBox="0 0 36 36"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Tiến trình xử lý</title>
        <circle className="ai-loading-track" cx="18" cy="18" r={RING_RADIUS} />
        <circle
          className="ai-loading-arc"
          cx="18"
          cy="18"
          r={RING_RADIUS}
          strokeDasharray={`${arc} ${RING_CIRCUMFERENCE}`}
        />
      </svg>
    </div>
  );
}

export function AiLoadingState({
  steps = [],
  activities = [],
  activity = null,
  waitElapsedSec = null,
  compact = false,
}: AiLoadingStateProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const displaySteps = useMemo(() => filterDisplaySteps(steps), [steps]);
  const feedLines = useMemo(() => {
    if (activities.length > 0) return activities;
    return displaySteps
      .filter((step) => step.status === "done")
      .map((step) => (step.detail ? `✓ ${step.label} — ${step.detail}` : `✓ ${step.label}`));
  }, [activities, displaySteps]);
  const progress = useMemo(() => computeProgress(steps), [steps]);
  const status = resolveStatus(displaySteps, activity);
  const statusWithElapsed =
    typeof waitElapsedSec === "number" && waitElapsedSec > 0
      ? `${status} · ${Math.round(waitElapsedSec)}s`
      : status;

  useEffect(() => {
    const el = feedRef.current;
    if (!el || feedLines.length <= VISIBLE_LINES) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [feedLines.length]);

  const lines = feedLines.length > 0 ? feedLines : [];

  return (
    <div
      className={`ai-loading-state${compact ? " ai-loading-state--compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="ai-loading-state-head">
        <LoadingAnimation progress={progress} />
        <span className="ai-loading-state-status">{statusWithElapsed}…</span>
      </div>

      {lines.length > 0 ? (
        <div className="ai-loading-state-feed-wrap">
          <div
            className="ai-loading-state-feed"
            ref={feedRef}
            style={{ height: compact ? LINE_HEIGHT_PX : LINE_HEIGHT_PX * VISIBLE_LINES }}
          >
            <div>
              {lines.map((text, index) => (
                <div className="ai-loading-state-line" key={`feed-${index}-${text}`}>
                  <div className="ai-loading-state-line-text">{text}</div>
                </div>
              ))}
            </div>
          </div>
          {!compact && lines.length > VISIBLE_LINES && (
            <div className="ai-loading-state-feed-fade" aria-hidden />
          )}
        </div>
      ) : null}
    </div>
  );
}
