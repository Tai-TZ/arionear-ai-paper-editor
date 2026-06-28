export const LLM_USER_ERROR_MSG =
  "Úi, kết nối tới AI đang bị gián đoạn một chút. Bạn thử đổi Model/Provider giúp mình nhé!";

const CONNECTION_MSG = LLM_USER_ERROR_MSG;

const GENERIC_MSG = LLM_USER_ERROR_MSG;

const AUTH_MSG = LLM_USER_ERROR_MSG;

const CITATION_MSG =
  "Không thể xác minh trích dẫn lúc này. Vui lòng thử lại sau.";

function isNetworkError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m === "network_error" ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("load failed") ||
    m.includes("fetch failed")
  );
}

function isTechnicalMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("http://") ||
    m.includes("https://") ||
    m.includes("localhost") ||
    m.includes("127.0.0.1") ||
    m.includes("cors") ||
    m.includes("exception") ||
    m.includes("traceback") ||
    m.startsWith("error code:") ||
    m.includes("insufficient balance") ||
    m.includes("please recharge") ||
    m.includes("no resource package") ||
    /error\s*code\s*:\s*\d{3}/.test(m) ||
    (m.includes("'error'") && (m.includes("'code'") || m.includes("'message'"))) ||
    (/\b[45]\d{2}\b/.test(message) && m.includes("error"))
  );
}

function isLlmProviderFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    isTechnicalMessage(message) ||
    m.includes("429") ||
    (m.includes("rate") && m.includes("limit")) ||
    m.includes("insufficient balance") ||
    m.includes("please recharge") ||
    m.includes("no resource package") ||
    m.includes("api key") ||
    m.includes("chưa cấu hình") ||
    m.includes("rerank") ||
    m.includes("model llm không khả dụng") ||
    m.includes("không thể gọi mô hình ai") ||
    m.includes("gián đoạn")
  );
}

function mapHttpStatus(status: number): string {
  if (status === 401 || status === 403) return AUTH_MSG;
  if (status === 503) return LLM_USER_ERROR_MSG;
  if (status >= 500) return GENERIC_MSG;
  return GENERIC_MSG;
}

/** Map any API/network error to a short, user-safe Vietnamese message. */
export function toUserFacingMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return CONNECTION_MSG;
  }

  const msg = error.message.trim();
  if (!msg || isNetworkError(msg) || isTechnicalMessage(msg)) {
    return CONNECTION_MSG;
  }

  return msg.length > 160 ? GENERIC_MSG : msg;
}

export function streamErrorMessage(message: string): string {
  if (isLlmProviderFailure(message)) {
    return LLM_USER_ERROR_MSG;
  }
  return toUserFacingMessage(new Error(message));
}

export function citationErrorMessage(): string {
  return CITATION_MSG;
}

export function mapApiHttpError(status: number, detail: unknown): string {
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as { msg?: string; loc?: unknown[] };
        const field = Array.isArray(record.loc)
          ? record.loc.filter((part) => typeof part === "string" && part !== "body").join(".")
          : "";
        const msg = typeof record.msg === "string" ? record.msg : null;
        if (!msg) return null;
        if (field === "name") return "Full name is required.";
        return field ? `${field}: ${msg}` : msg;
      })
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length) return messages[0];
  }

  if (typeof detail === "string" && detail && !isTechnicalMessage(detail) && detail.length <= 160) {
    if (status === 400 || status === 422) return detail;
    if (status < 500) return detail;
  }
  return mapHttpStatus(status);
}
