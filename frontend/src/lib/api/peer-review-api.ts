import { resolveApiBase } from "./base-url";
import { mapApiHttpError } from "./api-errors";
import type { LLMProvider } from "./academic";
import { getAccessToken, logoutUser } from "@/lib/auth-store";
import type { UiLanguage } from "@/lib/locale-store";

const API_BASE = resolveApiBase();

export type ReviewCategory = "major" | "minor" | "editorial" | "question";
export type ReviewTone = "courteous" | "formal" | "concise" | "confident";
export type LetterLanguage = "en" | "vi";
export type PeerReviewWarning =
  | "comments_truncated"
  | "manuscript_truncated"
  | "items_capped"
  | "split_fallback"
  | "draft_partial";

export const REVIEW_CATEGORIES: readonly ReviewCategory[] = [
  "major",
  "minor",
  "editorial",
  "question",
];
export const REVIEW_TONES: readonly ReviewTone[] = ["courteous", "formal", "concise", "confident"];

/** Characters the backend forwards to the model; longer input is truncated server-side. */
export const PEER_REVIEW_COMMENTS_SOFT_LIMIT = 24_000;
/** Hard request limit (the API rejects longer comments with 422). */
export const PEER_REVIEW_COMMENTS_MAX_LENGTH = 100_000;

export type PeerReviewItem = {
  id: string;
  reviewer: string | null;
  category: ReviewCategory;
  quote: string;
  quote_verified: boolean;
  summary: string;
  response: string;
  proposed_change: string;
  section_refs: string[];
  needs_author_input: boolean;
  unverified_numbers: string[];
  draft_failed: boolean;
};

export type PeerReviewResult = {
  items: PeerReviewItem[];
  reviewers: string[];
  letter_language: LetterLanguage;
  warnings: PeerReviewWarning[];
  omitted_item_count: number;
  provider: string;
  model: string;
};

export type PeerReviewRequest = {
  comments: string;
  latex_content: string;
  session_id?: string;
  locale?: UiLanguage;
  tone?: ReviewTone;
  llm_provider?: LLMProvider;
  llm_model?: string;
};

export type PeerReviewErrorCode =
  "quota_exceeded" | "llm_error" | "parse_failed" | "timeout" | "network" | "http";

export class PeerReviewApiError extends Error {
  readonly code: PeerReviewErrorCode;
  readonly status: number;

  constructor(code: PeerReviewErrorCode, message: string, status = 0) {
    super(message);
    this.name = "PeerReviewApiError";
    this.code = code;
    this.status = status;
  }
}

const CODED_ERRORS = new Set<PeerReviewErrorCode>([
  "quota_exceeded",
  "llm_error",
  "parse_failed",
  "timeout",
]);

function toApiError(status: number, detail: unknown, locale?: UiLanguage): PeerReviewApiError {
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const record = detail as { code?: unknown; message?: unknown };
    if (typeof record.code === "string" && CODED_ERRORS.has(record.code as PeerReviewErrorCode)) {
      const message = typeof record.message === "string" ? record.message : "";
      return new PeerReviewApiError(record.code as PeerReviewErrorCode, message, status);
    }
  }
  return new PeerReviewApiError("http", mapApiHttpError(status, detail, locale), status);
}

/** Draft point-by-point responses. Comment-only: the manuscript is never modified. */
export async function draftPeerReviewResponses(
  payload: PeerReviewRequest,
  options: { signal?: AbortSignal; locale?: UiLanguage } = {},
): Promise<PeerReviewResult> {
  const token = getAccessToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/review/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new PeerReviewApiError("network", "NETWORK_ERROR");
  }
  if (res.status === 401) {
    logoutUser();
  }
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      detail = body.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw toApiError(res.status, detail, options.locale);
  }
  return (await res.json()) as PeerReviewResult;
}
