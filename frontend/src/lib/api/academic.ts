import { mapApiHttpError, toUserFacingMessage } from "./api-errors";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:8000/api/v1";

export type LLMProvider = "openai" | "anthropic" | "openrouter";

export type IntegrityFlag = {
  code: string;
  message: string;
  severity: string;
};

export type ProviderInfo = {
  id: LLMProvider;
  name: string;
  default_model: string;
  models: string[];
};

export type ChatResult = {
  response: string;
  analysis?: string;
  task?: string;
  suggestion?: string;
  original_text?: string;
  diff?: string;
  apply_mode?: "selection" | "document";
  integrity_flags?: IntegrityFlag[];
  citation_results?: Record<string, unknown>[];
  structure_suggestions?: Record<string, unknown>[];
};

type LlmOptions = {
  llm_provider?: LLMProvider;
  llm_model?: string;
};

const COMPILE_CONNECTION_MSG =
  "Không kết nối được backend (localhost:8000). Hãy chạy: uvicorn src.main:app --reload --port 8000";

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
  return apiFetch("/providers");
}

export async function syncSession(
  sessionId: string,
  name: string,
  latexContent: string,
): Promise<void> {
  try {
    await apiFetch(`/sessions/${sessionId}`);
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
    task?: "style" | "structure" | "logic" | "citation" | "chat";
  } & LlmOptions,
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        session_id: opts.sessionId,
        latex_content: opts.latexContent,
        selection: opts.selection ?? "",
        task: opts.task,
        llm_provider: opts.llm_provider,
        llm_model: opts.llm_model,
      }),
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

  const dispatch = (block: string) => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;
    try {
      const payload = JSON.parse(parsed.data) as Record<string, unknown>;
      switch (parsed.event) {
        case "activity":
          if (typeof payload.text === "string") callbacks.onActivity(payload.text);
          break;
        case "reasoning":
          if (typeof payload.delta === "string") callbacks.onReasoning(payload.delta);
          break;
        case "token":
          if (typeof payload.delta === "string") callbacks.onToken(payload.delta);
          break;
        case "done":
          callbacks.onDone(payload as ChatResult);
          break;
        case "error":
          callbacks.onError(
            typeof payload.message === "string"
              ? toUserFacingMessage(new Error(payload.message))
              : toUserFacingMessage(new Error("UNKNOWN")),
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
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (part.trim()) dispatch(part);
    }
  }
  if (buffer.trim()) dispatch(buffer);
}

export async function sendChat(
  message: string,
  opts: {
    sessionId: string;
    latexContent: string;
    selection?: string;
    task?: "style" | "structure" | "logic" | "citation" | "chat";
  } & LlmOptions,
): Promise<ChatResult> {
  return apiFetch<ChatResult>("/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      session_id: opts.sessionId,
      latex_content: opts.latexContent,
      selection: opts.selection ?? "",
      task: opts.task,
      llm_provider: opts.llm_provider,
      llm_model: opts.llm_model,
    }),
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
  return apiFetch("/citations/verify", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      bib_content: bibContent,
    }),
  });
}

export type CompileAssetPayload = {
  name: string;
  content_base64: string;
};

export type CompileResult = {
  success: boolean;
  pdf_base64: string;
  log: string;
  error: string;
  engine: string;
  warning?: string;
};

export async function compileLatex(
  latex: string,
  assets: { name: string; dataUrl: string }[],
): Promise<CompileResult> {
  return apiFetch("/compile", {
    method: "POST",
    body: JSON.stringify({
      latex,
      assets: assets.map(
        (asset): CompileAssetPayload => ({
          name: asset.name,
          content_base64: asset.dataUrl,
        }),
      ),
    }),
  });
}

export async function fetchCompileStatus(): Promise<{ available: boolean; engine: string | null }> {
  return apiFetch("/compile/status");
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
}
