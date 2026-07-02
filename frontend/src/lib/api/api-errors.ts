import { apiErrorsCopy } from "@/lib/api-errors-i18n";
import type { UiLanguage } from "@/lib/locale-store";
import { getStoredLocale } from "@/lib/locale-store";

function resolveLocale(locale?: UiLanguage): UiLanguage {
  return locale ?? getStoredLocale();
}

function msgs(locale?: UiLanguage) {
  return apiErrorsCopy(resolveLocale(locale));
}

export function llmUserErrorMsg(locale?: UiLanguage): string {
  return msgs(locale).llm;
}

export function networkErrorMsg(locale?: UiLanguage): string {
  return msgs(locale).network;
}

export function streamInterruptedMessage(locale?: UiLanguage): string {
  return msgs(locale).streamInterrupted;
}

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

function isQuotaMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("hạn mức") ||
    m.includes("quota") ||
    m.includes("quá nhiều yêu cầu") ||
    m.includes("hết lượt") ||
    m.includes("dùng hết") ||
    m.includes("chưa được bật quyền dùng ai")
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
    m.includes("không thể gọi mô hình ai")
  );
}

function detailText(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const record = item as { msg?: string };
        return typeof record.msg === "string" ? record.msg : "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function mapHttpStatus(status: number, detail: unknown, locale?: UiLanguage): string {
  const m = msgs(locale);
  const detailStr = detailText(detail);

  if (status === 401 || status === 403) return m.auth;
  if (status === 429) {
    return isLlmProviderFailure(detailStr) ? m.llm : m.rateLimit;
  }
  if (status === 503 && isLlmProviderFailure(detailStr)) return m.llm;
  if (status === 502 || status === 503 || status === 504) return m.network;
  if (status >= 500) return m.backend;
  return m.backend;
}

/** Map any API/network error to a short, user-safe message in the active UI locale. */
export function toUserFacingMessage(error: unknown, locale?: UiLanguage): string {
  const m = msgs(locale);
  if (!(error instanceof Error)) {
    return m.network;
  }

  const msg = error.message.trim();
  if (!msg || isNetworkError(msg)) {
    return m.network;
  }
  if (isTechnicalMessage(msg)) {
    return m.backend;
  }

  return msg.length > 160 ? m.backend : msg;
}

function isKnownEditorErrorMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    isQuotaMessage(message) ||
    m.includes("provider ai đang giới hạn") ||
    m.includes("server ai đang quá tải") ||
    m.includes("chưa cấu hình api key") ||
    m.includes("model không khả dụng") ||
    m.includes("tài khoản provider hết số dư") ||
    m.includes("quá thời gian")
  );
}

export function streamErrorMessage(message: string, locale?: UiLanguage): string {
  if (isKnownEditorErrorMessage(message)) return message;
  const m = msgs(locale);
  if (isLlmProviderFailure(message)) {
    return m.llm;
  }
  return toUserFacingMessage(new Error(message), locale);
}

export function citationErrorMessage(locale?: UiLanguage): string {
  return msgs(locale).citation;
}

export function mapApiHttpError(status: number, detail: unknown, locale?: UiLanguage): string {
  const m = msgs(locale);
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
        if (field === "name") return m.validationNameRequired;
        return field ? `${field}: ${msg}` : msg;
      })
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length) return messages[0];
  }

  if (typeof detail === "string" && detail && !isTechnicalMessage(detail) && detail.length <= 160) {
    if (status === 400 || status === 422) return detail;
    if (status < 500) return detail;
    if (isLlmProviderFailure(detail)) return m.llm;
  }

  return mapHttpStatus(status, detail, locale);
}

export async function mapApiHttpErrorFromResponse(
  res: Response,
  locale?: UiLanguage,
): Promise<string> {
  let detail: unknown = res.statusText;
  try {
    const body = await res.json();
    detail = (body as { detail?: unknown }).detail ?? detail;
  } catch {
    /* ignore non-JSON bodies */
  }
  return mapApiHttpError(res.status, detail, locale);
}
