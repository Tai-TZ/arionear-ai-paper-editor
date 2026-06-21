/** Auth-specific HTTP errors — never map to AI assistant messages. */

export type AuthErrorCode = "account_disabled";

export type ParsedAuthError = {
  message: string;
  code?: AuthErrorCode;
};

function extractDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    const trimmed = detail.trim();
    return trimmed || null;
  }
  if (typeof detail === "object" && detail && "message" in detail) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === "object" && first && "msg" in first) {
      return String((first as { msg: string }).msg);
    }
  }
  return null;
}

function extractAuthCode(detail: unknown): AuthErrorCode | undefined {
  if (typeof detail === "object" && detail && "code" in detail) {
    const code = (detail as { code?: unknown }).code;
    if (code === "account_disabled") {
      return "account_disabled";
    }
  }
  return undefined;
}

export function parseAuthErrorResponse(status: number, detail: unknown): ParsedAuthError {
  const code = extractAuthCode(detail);
  const message = extractDetail(detail);
  if (message && message.length <= 200) {
    return { message, code };
  }

  if (status === 503) {
    return { message: "Authentication service is unavailable. Please try again later." };
  }
  if (status === 401) {
    return { message: "Invalid email or password." };
  }
  if (status >= 500) {
    return { message: "Something went wrong. Please try again." };
  }
  return { message: "Request failed. Please check your input and try again." };
}

export function mapAuthHttpError(status: number, detail: unknown): string {
  return parseAuthErrorResponse(status, detail).message;
}
