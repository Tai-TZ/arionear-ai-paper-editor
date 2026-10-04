import { getAccessToken } from "@/lib/auth-store";
import { resolveApiBase } from "@/lib/api/base-url";
import { mapApiHttpError, networkErrorMsg } from "@/lib/api/api-errors";
import type { UiLanguage } from "@/lib/researcher-profile";

const API_BASE = resolveApiBase();

export type AiDisclosureCounts = {
  proposed: number;
  /** Accepted as proposed (excludes `modified`). */
  accepted: number;
  /** Accepted after the author edited the diff. */
  modified: number;
  rejected: number;
  pending: number;
};

export type AiDisclosureTaskRow = AiDisclosureCounts & {
  /** style | edit | structure | template | citation | logic | chat (backend canonical order). */
  task: string;
  interactions: number;
};

export type AiDisclosureModelRow = {
  provider: string | null;
  provider_label: string | null;
  model: string | null;
  interactions: number;
};

export type AiDisclosureLocalizedText = Record<UiLanguage, string>;

export type AiDisclosureReport = {
  paper_id: string;
  paper_title: string;
  generated_at: string;
  has_ai_usage: boolean;
  period: {
    first_interaction_at: string | null;
    last_interaction_at: string | null;
  };
  totals: AiDisclosureCounts & { interactions: number };
  by_task: AiDisclosureTaskRow[];
  unattributed: AiDisclosureCounts;
  models: AiDisclosureModelRow[];
  attribution: { linked: number; inferred: number; unattributed: number };
  statement: AiDisclosureLocalizedText;
  latex: AiDisclosureLocalizedText;
  data_sources: string[];
};

/** Deterministic AI Contribution Report for a paper the current user owns. Read-only. */
export async function fetchAiDisclosureReport(
  paperId: string,
  locale?: UiLanguage,
): Promise<AiDisclosureReport> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated.");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/papers/${encodeURIComponent(paperId)}/ai-disclosure`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error(networkErrorMsg(locale));
  }

  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore non-JSON bodies */
    }
    throw new Error(mapApiHttpError(res.status, detail, locale));
  }

  return res.json() as Promise<AiDisclosureReport>;
}
