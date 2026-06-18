import { resolveApiBase } from "./base-url";
import { mapApiHttpError, streamErrorMessage, toUserFacingMessage } from "./api-errors";
import { fetchDedupe, invalidateFetchKey } from "./fetch-dedupe";

const API_BASE = resolveApiBase();

export type LLMProvider = "openai" | "anthropic" | "openrouter" | "zai";

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

export function applyAiState(
  steps: ChatAiStep[],
  payload: ChatAiStatePayload,
): ChatAiStep[] {
  const next = steps.map((step) =>
    step.status === "active" && step.id !== payload.step_id
      ? { ...step, status: "done" as const }
      : step,
  );
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
  }[];
  citation_results?: Record<string, unknown>[];
  structure_suggestions?: Record<string, unknown>[];
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

function buildChatRequestBody(
  message: string,
  opts: {
    sessionId: string;
    latexContent: string;
    selection?: string;
    task?: "style" | "structure" | "logic" | "citation" | "chat" | "edit" | "template";
    integrity_strictness?: "relaxed" | "standard" | "strict";
  } & LlmOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    message,
    latex_content: opts.latexContent,
    selection: opts.selection ?? "",
  };
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.task) body.task = opts.task;
  if (opts.llm_provider) body.llm_provider = opts.llm_provider;
  if (opts.llm_model?.trim()) body.llm_model = opts.llm_model.trim();
  if (opts.integrity_strictness) body.integrity_strictness = opts.integrity_strictness;
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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(path.startsWith("/compile") ? COMPILE_CONNECTION_MSG : "NETWORK_ERROR");
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

export async function syncSession(
  sessionId: string,
  name: string,
  latexContent: string,
): Promise<void> {
  try {
    await apiFetch(`/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, latex_content: latexContent }),
    });
  } catch {
    await apiFetch("/sessions", {
      method: "POST",
      body: JSON.stringify({
        id: sessionId,
        name,
        latex_content: latexContent,
      }),
    });
  }
}

export type StreamChatCallbacks = {
  onActivity: (text: string) => void;
  onState?: (state: ChatAiStatePayload) => void;
  onReasoning: (delta: string) => void;
  onToken: (delta: string) => void;
  onDone: (result: ChatResult) => void;
  onError: (message: string) => void;
};

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  return { event, data };
}

export async function streamChat(
  message: string,
  opts: {
    sessionId: string;
    latexContent: string;
    selection?: string;
    task?: "style" | "structure" | "logic" | "citation" | "chat" | "edit" | "template";
    integrity_strictness?: "relaxed" | "standard" | "strict";
  } & LlmOptions,
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(buildChatRequestBody(message, opts)),
      signal,
    });
  } catch {
    callbacks.onError(toUserFacingMessage(new Error("NETWORK_ERROR")));
    return;
  }

  if (!res.ok || !res.body) {
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    callbacks.onError(mapApiHttpError(res.status, detail));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  const dispatch = (block: string) => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;
    try {
      const payload = JSON.parse(parsed.data) as Record<string, unknown>;
      switch (parsed.event) {
        case "activity":
          if (typeof payload.text === "string") callbacks.onActivity(payload.text);
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
          if (typeof payload.delta === "string") callbacks.onReasoning(payload.delta);
          break;
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
          );
          break;
        default:
          break;
      }
    } catch {
      /* malformed chunk */
    }
  };

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
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (part.trim()) dispatch(part);
    }
  }
  if (buffer.trim()) dispatch(buffer);

  if (!finished) {
    if (signal?.aborted) return;
    callbacks.onError(
      streamErrorMessage("Kết nối stream bị gián đoạn. Vui lòng thử lại."),
    );
  }
  signal?.removeEventListener("abort", onAbort);
}

export async function sendChat(
  message: string,
  opts: {
    sessionId: string;
    latexContent: string;
    selection?: string;
    task?: "style" | "structure" | "logic" | "citation" | "chat" | "edit" | "template";
    integrity_strictness?: "relaxed" | "standard" | "strict";
  } & LlmOptions,
): Promise<ChatResult> {
  return apiFetch<ChatResult>("/chat", {
    method: "POST",
    body: JSON.stringify(buildChatRequestBody(message, opts)),
  });
}

export async function editStyle(
  sessionId: string,
  text: string,
  section: string,
  opts?: LlmOptions,
): Promise<{
  original_text: string;
  suggestion: string;
  diff: string;
  integrity_flags: IntegrityFlag[];
  revision_id: string;
}> {
  return apiFetch("/edit/style", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      text,
      section,
      llm_provider: opts?.llm_provider,
      llm_model: opts?.llm_model,
    }),
  });
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
  content_base64: string;
};

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

export async function compileLatex(
  latex: string,
  assets: { name: string; dataUrl: string }[],
  options?: {
    mainFile?: string;
    compiler?: LatexCompiler;
  },
): Promise<CompileResult> {
  return apiFetch("/compile", {
    method: "POST",
    body: JSON.stringify({
      latex,
      main_file: options?.mainFile ?? "main.tex",
      compiler: options?.compiler ?? "auto",
      assets: assets.map(
        (asset): CompileAssetPayload => ({
          name: asset.name,
          content_base64: asset.dataUrl,
        }),
      ),
    }),
  });
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
): Promise<SyncTeXHit> {
  return apiFetch("/compile/synctex", {
    method: "POST",
    body: JSON.stringify({
      synctex_base64: synctexBase64,
      pdf_base64: pdfBase64,
      page,
      x,
      y,
      jobname,
      word: word ?? "",
      context: context ?? "",
      latex: latex ?? "",
    }),
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
