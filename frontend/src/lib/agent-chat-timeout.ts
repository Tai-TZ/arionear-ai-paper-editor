/** Mirrors backend `compute_agent_task_timeout_sec` (+ client buffer). */

const TASK_BASE_MS: Record<string, number> = {
  edit: 120_000,
  style: 120_000,
  structure: 90_000,
  citation: 90_000,
  template: 60_000,
  chat: 90_000,
};

const CLIENT_BUFFER_MS = 15_000;
const MAX_CLIENT_MS = 195_000;

function isReasoningModel(model: string | undefined): boolean {
  if (!model) return false;
  const lowered = model.toLowerCase();
  return lowered.includes("nemotron") || lowered.includes("deepseek-r1");
}

export function agentChatStreamTimeoutMs(
  task: string | undefined,
  model: string | undefined,
): number {
  const key = (task ?? "chat").toLowerCase();
  let base = TASK_BASE_MS[key] ?? 120_000;
  if (isReasoningModel(model)) {
    base = Math.min(Math.round(base * 1.5), MAX_CLIENT_MS - CLIENT_BUFFER_MS);
  }
  return base + CLIENT_BUFFER_MS;
}
