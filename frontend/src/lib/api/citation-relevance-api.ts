import { resolveApiBase } from "./base-url";
import { mapApiHttpErrorFromResponse } from "./api-errors";
import { getAccessToken, logoutUser } from "@/lib/auth-store";
import type { UiLanguage } from "@/lib/locale-store";

const API_BASE = resolveApiBase();

/** Server-side cap on cite keys judged per request (keeps LLM cost bounded). */
export const CITATION_RELEVANCE_MAX_KEYS = 15;

export type CitationRelevanceVerdict = "supports" | "partial" | "unrelated" | "insufficient_info";

/** Why a verdict was produced; explains `insufficient_info` without inventing text. */
export type CitationRelevanceReason =
  "judged" | "not_cited" | "no_abstract" | "llm_error" | "invalid_output";

export type CitationRelevanceItem = {
  key: string;
  verdict: CitationRelevanceVerdict;
  reason: CitationRelevanceReason;
  rationale: string;
  confidence: number;
  claim_snippets: string[];
  source_title: string;
  source: "openalex" | "semantic_scholar" | "";
};

export type CitationRelevanceResponse = {
  results: CitationRelevanceItem[];
  summary: string;
  skipped_keys: string[];
  max_keys: number;
};

export type CitationRelevanceRequest = {
  sessionId: string;
  keys: string[];
  /** Live editor source (main file); the server falls back to the session copy when empty. */
  latexContent?: string;
  locale?: UiLanguage;
  signal?: AbortSignal;
};

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Citation Layer 4 — ask the LLM whether each cited source supports its claim (read-only). */
export async function checkCitationRelevance({
  sessionId,
  keys,
  latexContent = "",
  locale,
  signal,
}: CitationRelevanceRequest): Promise<CitationRelevanceResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/citations/relevance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        session_id: sessionId,
        keys: keys.slice(0, CITATION_RELEVANCE_MAX_KEYS),
        latex_content: latexContent,
        locale,
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("NETWORK_ERROR");
  }
  if (res.status === 401) {
    logoutUser();
  }
  if (!res.ok) {
    throw new Error(await mapApiHttpErrorFromResponse(res, locale));
  }
  return (await res.json()) as CitationRelevanceResponse;
}
