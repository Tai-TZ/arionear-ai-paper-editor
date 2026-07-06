import { resolveApiBase } from "./base-url";
import { getAccessToken, logoutUser } from "@/lib/auth-store";
import { buildCompileAssetHashes } from "@/lib/compile-asset-hash";
import { mapApiHttpError, streamErrorMessage, streamInterruptedMessage, toUserFacingMessage } from "./api-errors";
import { fetchDedupe, invalidateFetchKey } from "./fetch-dedupe";
import { contentFingerprint } from "@/lib/pending-edit-utils";

const API_BASE = resolveApiBase();

export type LLMProvider = "openai" | "anthropic" | "openrouter" | "zai" | "google";

export function normalizeLlmProvider(provider: string): LLMProvider {
  if (provider === "nvidia" || provider === "tokenrouter") return "openrouter";
  return provider as LLMProvider;
}

export type IntegrityFlag = {
  code: string;
  message: string;
  severity: string;
};

export type ModelOption = {
  id: string;
  label: string;
};

export type ProviderInfo = {
  id: LLMProvider;
  name: string;
  default_model: string;
  models: ModelOption[];
};

export type ChatAiStepStatus = "pending" | "active" | "done" | "error";

export type ChatAiStep = {
  id: string;
  label: string;
  detail?: string;
  status: ChatAiStepStatus;
};

export type ChatAiStatePayload = {
  step_id: string;
  status: "active" | "done";
  label: string;
  detail?: string;
  task?: string;
  section?: string;
  elapsed_sec?: number;
};

const PROGRESS_NOISE_STEP_IDS = new Set(["logic-heartbeat"]);

export function isProgressNoiseStep(stepId: string): boolean {
  return PROGRESS_NOISE_STEP_IDS.has(stepId);
}

/** Steps worth showing in the chat progress UI (hide heartbeat + per-persona noise). */
export function isDisplayProgressStep(stepId: string): boolean {
  if (isProgressNoiseStep(stepId)) return false;
  if (stepId.includes("persona-")) return false;
  return true;
}

export function filterDisplaySteps(steps: ChatAiStep[]): ChatAiStep[] {
  return steps.filter((step) => isDisplayProgressStep(step.id));
}

export function isProgressNoiseActivity(text: string): boolean {
  return text.startsWith("Đang chờ model LLM");
}

const FEED_SKIP_STEP_IDS = new Set(["parse", "intent", "llm", "scope"]);

/** Only append to the visible feed when a milestone completes (or logic audit starts). */
export function isImportantFeedEvent(state: ChatAiStatePayload): boolean {
  if (isProgressNoiseStep(state.step_id) || !isDisplayProgressStep(state.step_id)) {
    return false;
  }
  if (FEED_SKIP_STEP_IDS.has(state.step_id)) return false;
  if (state.step_id.endsWith("-synthesize") && state.status !== "done") return false;
  if (state.status === "done") return true;
  if (state.step_id === "logic-start") return true;
  if (state.step_id === "edit-scope" && state.status === "done") return true;
  return false;
}

export function formatFeedLine(state: ChatAiStatePayload): string {
  const prefix = state.status === "done" ? "✓ " : "● ";
  return state.detail ? `${prefix}${state.label} — ${state.detail}` : `${prefix}${state.label}`;
}

export function appendImportantFeedLine(
  activities: string[],
  state: ChatAiStatePayload,
): string[] {
  if (!isImportantFeedEvent(state)) return activities;
  const line = formatFeedLine(state);
  if (activities[activities.length - 1] === line) return activities;
  return [...activities, line];
}

export function applyAiState(
  steps: ChatAiStep[],
  payload: ChatAiStatePayload,
): ChatAiStep[] {
  if (isProgressNoiseStep(payload.step_id)) {
    return steps;
  }
  const next = [...steps];
  const step: ChatAiStep = {
    id: payload.step_id,
    label: payload.label,
    detail: payload.detail,
    status: payload.status === "done" ? "done" : "active",
  };
  const existing = next.findIndex((s) => s.id === payload.step_id);
  if (existing >= 0) {
    next[existing] = step;
  } else {
    next.push(step);
  }
  return next;
}

export type ChatResult = {
  response: string;
  analysis?: string;
  task?: string;
  suggestion?: string;
  original_text?: string;
  diff?: string;
  apply_mode?: "selection" | "document";
  revision_id?: string;
  integrity_flags?: IntegrityFlag[];
  edits?: {
    id: string;
    file: string;
    section?: string;
    apply_mode?: "selection" | "document";
    original_text: string;
    replacement_text: string;
    description?: string;
    selection_start?: number;
    selection_end?: number;
  }[];
  citation_results?: Record<string, unknown>[];
  structure_suggestions?: Record<string, unknown>[];
  logic_audit_report?: LogicAuditReport;
};

export type LogicAuditReport = {
  summary?: string;
  integrity_mode?: string;
  sections?: {
    section: string;
    conflicts?: {
      id: string;
      type: string;
      severity: string;
      claim_text?: string;
      evidence_text?: string;
      comment: string;
      suggested_action?: string;
      persona_sources?: string[];
    }[];
    weak_claims?: string[];
    consensus_notes?: string[];
  }[];
  cross_section_conflicts?: {
    type: string;
    description: string;
    spans?: { section: string; text: string }[];
  }[];
  meta?: Record<string, unknown>;
};

export type RevisionRecord = {
  id: string;
  section: string;
  original: string;
  suggestion: string;
  action: string;
  created_at: string;
};

type LlmOptions = {
  llm_provider?: LLMProvider;
  llm_model?: string;
};

export type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

function buildChatRequestBody(
  message: string,
  opts: {
    sessionId: string;
    latexContent: string;
    latexContentHash?: string;
    activeFileContent?: string;
    activeFileContentHash?: string;
    selection?: string;
    selectionStart?: number;
    selectionEnd?: number;
    locale?: "vi" | "en";
    task?: "style" | "structure" | "logic" | "citation" | "chat" | "edit" | "template";
    integrity_strictness?: "relaxed" | "standard" | "strict";
    logic_audit_mode?: "quick" | "deep" | "gate";
    logic_audit_scope?: "selected" | "full";
    logic_audit_sections?: string[];
    conversationHistory?: ChatHistoryTurn[];
    activeFile?: string;
    mainFile?: string;
  } & LlmOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    message,
    latex_content: opts.latexContent,
    selection: opts.selection ?? "",
  };
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.latexContentHash) body.latex_content_hash = opts.latexContentHash;
  if (opts.task) body.task = opts.task;
  if (opts.llm_provider) body.llm_provider = opts.llm_provider;
  if (opts.llm_model?.trim()) body.llm_model = opts.llm_model.trim();
  if (opts.integrity_strictness) body.integrity_strictness = opts.integrity_strictness;
  if (opts.logic_audit_mode) body.logic_audit_mode = opts.logic_audit_mode;
  if (opts.logic_audit_scope) body.logic_audit_scope = opts.logic_audit_scope;
  if (opts.logic_audit_sections?.length) {
    body.logic_audit_sections = opts.logic_audit_sections;
  }
  if (opts.conversationHistory?.length) {
    body.conversation_history = opts.conversationHistory;
  }
  if (opts.activeFile?.trim()) body.active_file = opts.activeFile.trim();
  if (opts.mainFile?.trim()) body.main_file = opts.mainFile.trim();
  if (opts.activeFileContent !== undefined) {
    body.active_file_content = opts.activeFileContent;
  }
  if (opts.activeFileContentHash) {
    body.active_file_content_hash = opts.activeFileContentHash;
  }
  if (opts.selectionStart != null) body.selection_start = opts.selectionStart;
  if (opts.selectionEnd != null) body.selection_end = opts.selectionEnd;
  if (opts.locale) body.locale = opts.locale;
  return body;
}

const COMPILE_CONNECTION_MSG =
  "Không kết nối được backend. Chạy: python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8000";

const TRACE_STAGE_LABELS: Record<string, string> = {
  request_received: "Nhận yêu cầu",
  manuscript_parsed: "Đọc bản thảo",
  intent_classified: "Phân loại ý định",
  llm_stream_start: "Bắt đầu gọi LLM",
  llm_first_token: "Token đầu tiên",
  agent_start: "Chạy agent",
  response_ready: "Hoàn tất",
};

function formatTraceActivity(stage: string, payload: Record<string, unknown>): string {
  const label = TRACE_STAGE_LABELS[stage] ?? stage.replaceAll("_", " ");
  const totalMs = typeof payload.total_ms === "number" ? payload.total_ms : 0;
  const seconds = (totalMs / 1000).toFixed(1);
  const intent = typeof payload.intent === "string" ? payload.intent : "";
  const section = typeof payload.section === "string" ? payload.section : "";
  const suffix = intent ? ` · ${intent}` : section ? ` · ${section}` : "";
  return `${label}${suffix} · ${seconds}s`;
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(path.startsWith("/compile") ? COMPILE_CONNECTION_MSG : "NETWORK_ERROR");
  }
  if (res.status === 401) {
    logoutUser();
  }
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(mapApiHttpError(res.status, detail));
  }
  return res.json() as Promise<T>;
}

export async function fetchProviders(): Promise<{
  default_provider: LLMProvider;
  providers: ProviderInfo[];
}> {
  return fetchDedupe("providers", () => apiFetch("/providers"), 60_000);
}

type SessionSyncRecord = {
  syncedHash: string | null;
  syncedName: string | null;
  inflight: Promise<void> | null;
};

const sessionSyncById = new Map<string, SessionSyncRecord>();

function sessionSyncRecord(sessionId: string): SessionSyncRecord {
  let record = sessionSyncById.get(sessionId);
  if (!record) {
    record = { syncedHash: null, syncedName: null, inflight: null };
    sessionSyncById.set(sessionId, record);
  }
  return record;
}

/** Drop cached sync state when switching projects (fresh page load starts empty). */
export function invalidateSessionSync(sessionId?: string) {
  if (sessionId) sessionSyncById.delete(sessionId);
  else sessionSyncById.clear();
}

/** Mark session cache as synced without a network call (e.g. after GET /papers). */
export function markSessionSynced(
  sessionId: string,
  name: string,
  latexContent: string,
): void {
  const record = sessionSyncRecord(sessionId);
  record.syncedHash = contentFingerprint(latexContent);
  record.syncedName = name;
}

async function patchOrCreateSession(
  sessionId: string,
  name: string,
  latexContent: string,
): Promise<void> {
  const patchBody = JSON.stringify({ name, latex_content: latexContent });
  const headers = {
    "Content-Type": "application/json",
    ...authHeaders(),
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: "PATCH",
        headers,
        body: patchBody,
      });
    } catch {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
        continue;
      }
      throw new Error("NETWORK_ERROR");
    }

    if (res.ok) return;

    if (res.status === 404) {
      const postRes = await fetch(`${API_BASE}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ id: sessionId, name, latex_content: latexContent }),
      });
      if (!postRes.ok) {
        let detail: unknown = postRes.statusText;
        try {
          const body = await postRes.json();
          detail = body.detail ?? detail;
        } catch {
          /* ignore */
        }
        throw new Error(mapApiHttpError(postRes.status, detail));
      }
      return;
    }

    // 500 lock timeout etc. — retry; never fall through to POST (worsens contention).
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      continue;
    }

    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(mapApiHttpError(res.status, detail));
  }
}

/**
 * Sync LaTeX to the agent session cache (server-side papers row for AI).
 * Skips when content hash unchanged; coalesces concurrent calls per session.
 * Call on editor boot and before chat — not on every autosave.
 */
export async function syncSession(
  sessionId: string,
  name: string,
  latexContent: string,
  options?: { force?: boolean },
): Promise<void> {
  const hash = contentFingerprint(latexContent);
  const record = sessionSyncRecord(sessionId);

  if (
    !options?.force &&
    record.syncedHash === hash &&
    record.syncedName === name &&
    !record.inflight
  ) {
    return;
  }

  if (record.inflight) {
    await record.inflight.catch(() => {});
    if (
      !options?.force &&
      record.syncedHash === hash &&
      record.syncedName === name
    ) {
      return;
    }
  }

  const run = patchOrCreateSession(sessionId, name, latexContent).then(() => {
    record.syncedHash = hash;
    record.syncedName = name;
  });

  record.inflight = run.finally(() => {
    if (record.inflight === run) record.inflight = null;
  });

  await record.inflight;
}

export type StreamChatCallbacks = {
  onActivity: (text: string) => void;
  onState?: (state: ChatAiStatePayload) => void;
  onReasoning?: (delta: string) => void;
  onLogicSection?: (section: NonNullable<LogicAuditReport["sections"]>[number]) => void;
  onToken: (delta: string) => void;
  onDone: (result: ChatResult) => void;
  onError: (message: string, meta?: { code?: string; reason?: string }) => void;
};

/** SSE error code — server cache miss/stale; client should retry with full LaTeX body. */
export const CHAT_CONTENT_RESYNC_CODE = "content_resync_required";

function normalizeSseText(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function inferSseEventType(event: string, payload: Record<string, unknown>): string {
  if (event !== "message") return event;
  if (typeof payload.step_id === "string") return "state";
  if (typeof payload.text === "string") return "activity";
  if (typeof payload.stage === "string") return "trace";
  if (typeof payload.delta === "string") return "token";
  if (typeof payload.message === "string") return "error";
  if ("response" in payload || "logic_audit_report" in payload) return "done";
  return event;
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  const normalized = normalizeSseText(block.trim());
  if (!normalized || normalized.startsWith(":")) return null;
  let event = "message";
  let data = "";
  for (const line of normalized.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  return { event, data };
}

function createSseDispatcher(callbacks: StreamChatCallbacks): {
  dispatchBlock: (block: string) => void;
  isFinished: () => boolean;
} {
  let finished = false;

  const dispatchBlock = (block: string) => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;
    try {
      const payload = JSON.parse(parsed.data) as Record<string, unknown>;
      const eventType = inferSseEventType(parsed.event, payload);
      switch (eventType) {
        case "activity":
          if (
            typeof payload.text === "string" &&
            !isProgressNoiseActivity(payload.text)
          ) {
            callbacks.onActivity(payload.text);
          }
          break;
        case "trace": {
          const stage = typeof payload.stage === "string" ? payload.stage : "";
          if (stage) {
            callbacks.onActivity(formatTraceActivity(stage, payload));
          }
          break;
        }
        case "state": {
          const stepId = typeof payload.step_id === "string" ? payload.step_id : "";
          const status = payload.status === "done" ? "done" : "active";
          const label = typeof payload.label === "string" ? payload.label : "";
          if (stepId && label) {
            const statePayload: ChatAiStatePayload = {
              step_id: stepId,
              status,
              label,
              detail: typeof payload.detail === "string" ? payload.detail : undefined,
              task: typeof payload.task === "string" ? payload.task : undefined,
              section: typeof payload.section === "string" ? payload.section : undefined,
              elapsed_sec:
                typeof payload.elapsed_sec === "number" ? payload.elapsed_sec : undefined,
            };
            callbacks.onState?.(statePayload);
          }
          break;
        }
        case "reasoning":
          if (typeof payload.delta === "string") callbacks.onReasoning?.(payload.delta);
          break;
        case "logic_section": {
          const section = payload.section;
          if (section && typeof section === "object") {
            callbacks.onLogicSection?.(
              section as NonNullable<LogicAuditReport["sections"]>[number],
            );
          }
          break;
        }
        case "token":
          if (typeof payload.delta === "string") callbacks.onToken(payload.delta);
          break;
        case "done":
          finished = true;
          callbacks.onDone(payload as ChatResult);
          break;
        case "error":
          finished = true;
          callbacks.onError(
            typeof payload.message === "string"
              ? streamErrorMessage(payload.message)
              : streamErrorMessage("UNKNOWN"),
            {
              code: typeof payload.code === "string" ? payload.code : undefined,
              reason: typeof payload.reason === "string" ? payload.reason : undefined,
            },
          );
          break;
        default:
          break;
      }
    } catch {
      /* malformed chunk */
    }
  };

  return {
    dispatchBlock,
    isFinished: () => finished,
  };
}

function ingestSseText(
  buffer: string,
  incoming: string,
  dispatchBlock: (block: string) => void,
): string {
  let next = normalizeSseText(buffer + incoming);
  const parts = next.split("\n\n");
  next = parts.pop() ?? "";
  for (const part of parts) {
    if (part.trim()) dispatchBlock(part);
  }
  return next;
}

/** XHR onprogress receives chunks as they arrive; fetch().body often buffers via dev proxy. */
function streamChatWithXhr(
  url: string,
  body: string,
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const { dispatchBlock, isFinished } = createSseDispatcher(callbacks);
    let buffer = "";
    let responseSeen = 0;
    let failed = false;

    const finish = () => {
      buffer = ingestSseText(buffer, "\n\n", dispatchBlock);
      if (!failed && !isFinished() && !signal?.aborted) {
        callbacks.onError(streamInterruptedMessage());
      }
      resolve();
    };

    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Cache-Control", "no-cache");
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.HEADERS_RECEIVED) return;
      if (xhr.status >= 200 && xhr.status < 300) return;
      failed = true;
      if (xhr.status === 401) logoutUser();
      let detail: unknown = xhr.statusText;
      try {
        detail = JSON.parse(xhr.responseText)?.detail ?? detail;
      } catch {
        /* ignore */
      }
      callbacks.onError(mapApiHttpError(xhr.status, detail));
      xhr.abort();
    };

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(responseSeen);
      responseSeen = xhr.responseText.length;
      if (!chunk) return;
      buffer = ingestSseText(buffer, chunk, dispatchBlock);
    };

    xhr.onload = finish;
    xhr.onerror = () => {
      if (!failed && !signal?.aborted) {
        callbacks.onError(toUserFacingMessage(new Error("NETWORK_ERROR")));
      }
      resolve();
    };
    xhr.onabort = () => resolve();

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

async function streamChatWithFetch(
  url: string,
  body: string,
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        ...authHeaders(),
      },
      body,
      signal,
    });
  } catch {
    callbacks.onError(toUserFacingMessage(new Error("NETWORK_ERROR")));
    return;
  }

  if (res.status === 401) {
    logoutUser();
  }

  if (!res.ok || !res.body) {
    let detail: unknown = res.statusText;
    try {
      const parsed = await res.json();
      detail = parsed.detail ?? detail;
    } catch {
      /* ignore */
    }
    callbacks.onError(mapApiHttpError(res.status, detail));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const { dispatchBlock, isFinished } = createSseDispatcher(callbacks);
  let buffer = "";

  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (err) {
      if (signal?.aborted) return;
      callbacks.onError(toUserFacingMessage(err));
      return;
    }
    const { done, value } = chunk;
    if (done) break;
    buffer = ingestSseText(buffer, decoder.decode(value, { stream: true }), dispatchBlock);
  }
  if (buffer.trim()) dispatchBlock(buffer);

  if (!isFinished()) {
    if (signal?.aborted) return;
        callbacks.onError(streamInterruptedMessage());
  }
  signal?.removeEventListener("abort", onAbort);
}

export async function streamChat(
  message: string,
  opts: {
    sessionId: string;
    latexContent: string;
    latexContentHash?: string;
    activeFileContent?: string;
    activeFileContentHash?: string;
    selection?: string;
    selectionStart?: number;
    selectionEnd?: number;
    locale?: "vi" | "en";
    task?: "style" | "structure" | "logic" | "citation" | "chat" | "edit" | "template";
    integrity_strictness?: "relaxed" | "standard" | "strict";
    logic_audit_mode?: "quick" | "deep" | "gate";
    logic_audit_scope?: "selected" | "full";
    logic_audit_sections?: string[];
    conversationHistory?: ChatHistoryTurn[];
    activeFile?: string;
    mainFile?: string;
  } & LlmOptions,
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${API_BASE}/chat/stream`;
  const body = JSON.stringify(buildChatRequestBody(message, opts));

  if (typeof XMLHttpRequest !== "undefined") {
    await streamChatWithXhr(url, body, callbacks, signal);
    return;
  }

  await streamChatWithFetch(url, body, callbacks, signal);
}

export async function verifyCitations(
  sessionId: string,
  bibContent = "",
): Promise<{ results: Record<string, unknown>[]; summary: string }> {
  const result = await apiFetch<{ results: Record<string, unknown>[]; summary: string }>(
    "/citations/verify",
    {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        bib_content: bibContent,
      }),
    },
  );
  invalidateFetchKey(`citations:${sessionId}`);
  return result;
}

export type CompileAssetPayload = {
  name: string;
  content_base64?: string;
  content_hash?: string;
};

export type CompileMode = "full" | "fast";

export type LatexCompiler = "auto" | "pdflatex" | "xelatex" | "lualatex" | "latex";

export type CompileEnginesInfo = {
  pdflatex: string | null;
  xelatex: string | null;
  lualatex: string | null;
  latex: string | null;
  latexmk: string | null;
  biber: string | null;
  bibtex: string | null;
};

export type CompileResult = {
  success: boolean;
  pdf_base64: string;
  log: string;
  error: string;
  engine: string;
  compiler?: string;
  warning?: string;
  synctex_base64?: string;
  main_file?: string;
};

export type CompileStatus = {
  available: boolean;
  engine: string | null;
  engines?: CompileEnginesInfo;
};

const COMPILE_GZIP_MIN_BYTES = 32_768;

async function postCompileBody(body: Record<string, unknown>): Promise<Response> {
  const json = JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(),
  };
  let payload: BodyInit = json;
  if (typeof CompressionStream !== "undefined" && json.length >= COMPILE_GZIP_MIN_BYTES) {
    const compressed = await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    payload = compressed;
    headers["Content-Encoding"] = "gzip";
  }
  return fetch(`${API_BASE}/compile`, {
    method: "POST",
    headers,
    body: payload,
  });
}

function isAssetResyncDetail(detail: unknown): detail is { code: string; assets?: string[] } {
  return (
    typeof detail === "object" &&
    detail !== null &&
    "code" in detail &&
    (detail as { code: string }).code === "ASSET_RESYNC_REQUIRED"
  );
}

export async function compileLatex(
  latex: string,
  assets: { name: string; dataUrl: string }[],
  options?: {
    mainFile?: string;
    compiler?: LatexCompiler;
    cacheId?: string;
    mode?: CompileMode;
    knownAssetHashes?: Record<string, string>;
    forceFullAssets?: boolean;
  },
): Promise<CompileResult> {
  const cacheId = options?.cacheId ?? null;
  const mode = options?.mode ?? "full";
  const assetHashes = await buildCompileAssetHashes(assets);
  const known = options?.knownAssetHashes ?? {};
  const useDelta = Boolean(cacheId) && !options?.forceFullAssets;

  const buildPayload = (delta: boolean): Record<string, unknown> => ({
    latex,
    main_file: options?.mainFile ?? "main.tex",
    compiler: options?.compiler ?? "auto",
    cache_id: cacheId,
    mode,
    assets: assets.map((asset): CompileAssetPayload => {
      const hash = assetHashes[asset.name];
      if (delta && useDelta && known[asset.name] === hash) {
        return { name: asset.name, content_hash: hash };
      }
      return { name: asset.name, content_base64: asset.dataUrl };
    }),
  });

  const send = async (delta: boolean): Promise<CompileResult> => {
    let res: Response;
    try {
      res = await postCompileBody(buildPayload(delta));
    } catch {
      throw new Error(COMPILE_CONNECTION_MSG);
    }
    if (res.status === 401) {
      logoutUser();
    }
    if (res.status === 409) {
      let detail: unknown = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail ?? detail;
      } catch {
        /* ignore */
      }
      if (isAssetResyncDetail(detail) && delta) {
        return send(false);
      }
      throw new Error(mapApiHttpError(res.status, detail));
    }
    if (!res.ok) {
      let detail: unknown = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail ?? detail;
      } catch {
        /* ignore */
      }
      throw new Error(mapApiHttpError(res.status, detail));
    }
    return res.json() as Promise<CompileResult>;
  };

  const result = await send(Boolean(cacheId) && !options?.forceFullAssets);
  (result as CompileResult & { assetHashes?: Record<string, string> }).assetHashes = assetHashes;
  return result;
}

export async function fetchCompileStatus(): Promise<CompileStatus> {
  return fetchDedupe("compile:status", () => apiFetch<CompileStatus>("/compile/status"), 60_000);
}

export type SyncTeXHit = {
  file: string;
  line: number;
  synctex_line?: number;
  column: number;
  page: number;
  found: boolean;
};

export async function lookupSynctexInverse(
  synctexBase64: string,
  pdfBase64: string,
  page: number,
  x: number,
  y: number,
  jobname = "main",
  word = "",
  latex = "",
  context = "",
  options?: { cacheId?: string },
): Promise<SyncTeXHit> {
  const cacheId = options?.cacheId?.trim();
  const body: Record<string, unknown> = {
    page,
    x,
    y,
    jobname,
    word: word ?? "",
    context: context ?? "",
  };
  if (cacheId) {
    body.cache_id = cacheId;
  } else {
    body.synctex_base64 = synctexBase64;
    body.pdf_base64 = pdfBase64;
    body.latex = latex ?? "";
  }
  return apiFetch("/compile/synctex", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function revisionAction(
  sessionId: string,
  revisionId: string,
  action: "accepted" | "rejected" | "modified",
): Promise<void> {
  await apiFetch(`/revisions/${sessionId}/${revisionId}`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
  invalidateFetchKey(`revisions:${sessionId}`);
}

export async function fetchRevisions(sessionId: string): Promise<RevisionRecord[]> {
  const data = await fetchDedupe(`revisions:${sessionId}`, () =>
    apiFetch<{ revisions: RevisionRecord[] }>(`/sessions/${sessionId}/revisions`),
  );
  return data.revisions ?? [];
}

export async function fetchCitationRegistry(sessionId: string): Promise<{
  results: Record<string, unknown>[];
  summary: string;
}> {
  return fetchDedupe(`citations:${sessionId}`, () =>
    apiFetch<{ results: Record<string, unknown>[]; summary: string }>(
      `/sessions/${sessionId}/citations`,
    ),
  );
}
