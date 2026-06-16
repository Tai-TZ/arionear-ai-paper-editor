/** Auth-specific HTTP errors — never map to AI assistant messages. */

function extractDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    const trimmed = detail.trim();
    return trimmed || null;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === "object" && first && "msg" in first) {
      return String((first as { msg: string }).msg);
    }
  }
  return null;
}

export function mapAuthHttpError(status: number, detail: unknown): string {
  const message = extractDetail(detail);
  if (message && message.length <= 200) {
    return message;
  }

  if (status === 503) {
    return "Authentication service is unavailable. Please try again later.";
  }
  if (status === 401) {
    return "Invalid email or password.";
  }
  if (status >= 500) {
    return "Something went wrong. Please try again.";
  }
  return "Request failed. Please check your input and try again.";
}
