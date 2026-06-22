import { useSyncExternalStore } from "react";

import {
  appendImportantFeedLine,
  applyAiState,
  filterDisplaySteps,
  isProgressNoiseActivity,
  isProgressNoiseStep,
  type ChatAiStatePayload,
  type ChatAiStep,
} from "@/lib/api/academic";

export type ChatStreamProgressSnapshot = {
  activity: string | null;
  steps: ChatAiStep[];
  activities: string[];
  waitElapsedSec: number | null;
};

const EMPTY: ChatStreamProgressSnapshot = {
  activity: null,
  steps: [],
  activities: [],
  waitElapsedSec: null,
};

let snapshot: ChatStreamProgressSnapshot = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function commit(next: ChatStreamProgressSnapshot): void {
  snapshot = next;
  emit();
}

export function getChatStreamProgressSnapshot(): ChatStreamProgressSnapshot {
  return snapshot;
}

export function subscribeChatStreamProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChatStreamProgress(): ChatStreamProgressSnapshot {
  return useSyncExternalStore(
    subscribeChatStreamProgress,
    getChatStreamProgressSnapshot,
    getChatStreamProgressSnapshot,
  );
}

export { filterDisplaySteps };

export function startChatStreamWaitTimer(): void {
  /* no-op: avoid 1s UI ticks */
}

export function stopChatStreamWaitTimer(): void {}

export function resetChatStreamProgress(): void {
  commit(EMPTY);
}

export function pushChatStreamActivity(text: string): void {
  if (isProgressNoiseActivity(text)) return;
  commit({
    ...snapshot,
    activity: text,
  });
}

export function pushChatStreamState(state: ChatAiStatePayload): void {
  if (isProgressNoiseStep(state.step_id)) {
    return;
  }

  const activityText = state.detail ? `${state.label} — ${state.detail}` : state.label;
  const nextSteps = applyAiState(snapshot.steps, state);
  commit({
    ...snapshot,
    activity: activityText,
    steps: nextSteps,
    activities: appendImportantFeedLine(snapshot.activities, state),
  });
}

export function finishChatStreamProgress(): void {
  stopChatStreamWaitTimer();
  commit({ ...snapshot, waitElapsedSec: null });
}
