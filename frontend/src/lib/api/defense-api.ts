import { resolveApiBase } from "./base-url";
import {
  mapApiHttpError,
  networkErrorMsg,
  streamErrorMessage,
  streamInterruptedMessage,
  toUserFacingMessage,
} from "./api-errors";
import { getAccessToken } from "@/lib/auth-store";
import type { LLMProvider } from "./academic";
import { createSseStreamParser } from "./sse";

const API_BASE = resolveApiBase();

export type DefenseConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type DefenseMode = "proactive";

export type DefenseQuota = {
  plan: "free" | "pro";
  limit: number;
  used: number;
  remaining: number;
  period: string;
  period_type: "daily" | "monthly";
  resets_at?: string | null;
};

/** When true, block sends after quota is exhausted. Display is always shown when quota is loaded. */
export const DEFENSE_QUOTA_ENABLED = true;

export type DefenseStreamRequest = {
  latex_content: string;
  conversation_history: DefenseConversationTurn[];
  mode: DefenseMode;
  paper_id?: string;
  llm_provider?: LLMProvider;
  llm_model?: string;
  locale?: "en" | "vi";
  user_name?: string;
};

export type DefenseStreamCallbacks = {
  onActivity: (text: string) => void;
  onToken: (delta: string) => void;
  onDone: (response: string) => void;
  onError: (message: string) => void;
};

// ─── SSE event dispatch (parsing lives in ./sse, shared with academic.ts) ─

function createDefenseDispatcher(callbacks: DefenseStreamCallbacks): {
  dispatchEvent: (event: string, data: string) => void;
  isFinished: () => boolean;
} {
  let finished = false;

  const dispatchEvent = (event: string, data: string) => {
    try {
      const payload = JSON.parse(data) as Record<string, unknown>;
      const eventType = event !== "message" ? event : inferEventType(payload);
      switch (eventType) {
        case "activity":
          if (typeof payload.text === "string") callbacks.onActivity(payload.text);
          break;
        case "token":
          if (typeof payload.delta === "string") callbacks.onToken(payload.delta);
          break;
        case "done":
          finished = true;
          callbacks.onDone(typeof payload.response === "string" ? payload.response : "");
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
      /* malformed chunk — ignore */
    }
  };

  return { dispatchEvent, isFinished: () => finished };
}

function inferEventType(payload: Record<string, unknown>): string {
  if (typeof payload.text === "string") return "activity";
  if (typeof payload.delta === "string") return "token";
  if ("response" in payload) return "done";
  if (typeof payload.message === "string") return "error";
  return "unknown";
}

// ─── XHR streaming (preferred — avoids Vite proxy buffering) ──────────────

function streamDefenseWithXhr(
  url: string,
  body: string,
  authToken: string | null,
  callbacks: DefenseStreamCallbacks,
  signal: AbortSignal | undefined,
  interruptedMsg: string,
): Promise<void> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const { dispatchEvent, isFinished } = createDefenseDispatcher(callbacks);
    const sse = createSseStreamParser(dispatchEvent);
    let responseSeen = 0;
    let failed = false;

    const finish = () => {
      sse.flush();
      if (!failed && !isFinished() && !signal?.aborted) {
        callbacks.onError(streamErrorMessage(interruptedMsg));
      }
      resolve();
    };

    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Cache-Control", "no-cache");
    if (authToken) xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.HEADERS_RECEIVED) return;
      if (xhr.status >= 200 && xhr.status < 300) return;
      failed = true;
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
      sse.feed(chunk);
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

// ─── fetch fallback ────────────────────────────────────────────────────────

async function streamDefenseWithFetch(
  url: string,
  body: string,
  authToken: string | null,
  callbacks: DefenseStreamCallbacks,
  signal: AbortSignal | undefined,
  interruptedMsg: string,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
  };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body, signal });
  } catch {
    callbacks.onError(toUserFacingMessage(new Error("NETWORK_ERROR")));
    return;
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
  const { dispatchEvent, isFinished } = createDefenseDispatcher(callbacks);
  const sse = createSseStreamParser(dispatchEvent);

  const onAbort = () => void reader.cancel().catch(() => {});
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
    sse.feed(decoder.decode(value, { stream: true }));
  }
  sse.flush();
  if (!isFinished() && !signal?.aborted) {
    callbacks.onError(streamErrorMessage(interruptedMsg));
  }
  signal?.removeEventListener("abort", onAbort);
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function fetchDefenseQuota(): Promise<DefenseQuota> {
  const authToken = getAccessToken();
  if (!authToken) throw new Error("Not authenticated.");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/defense/quota`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  } catch {
    throw new Error(networkErrorMsg());
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

  return res.json() as Promise<DefenseQuota>;
}

export async function streamDefense(
  request: DefenseStreamRequest,
  callbacks: DefenseStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${API_BASE}/defense/stream`;
  const authToken = getAccessToken();
  const body = JSON.stringify(request);
  const interruptedMsg = streamInterruptedMessage(request.locale);

  if (typeof XMLHttpRequest !== "undefined") {
    await streamDefenseWithXhr(url, body, authToken, callbacks, signal, interruptedMsg);
    return;
  }
  await streamDefenseWithFetch(url, body, authToken, callbacks, signal, interruptedMsg);
}
