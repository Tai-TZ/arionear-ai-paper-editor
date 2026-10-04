import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { LLMProvider } from "@/lib/api/academic";
import {
  draftPeerReviewResponses,
  PeerReviewApiError,
  REVIEW_CATEGORIES,
  REVIEW_TONES,
  type PeerReviewItem,
  type PeerReviewResult,
  type ReviewTone,
} from "@/lib/api/peer-review-api";
import type { UiLanguage } from "@/lib/locale-store";
import { peerReviewCopy, responseLetterLabels, type PeerReviewCopy } from "@/lib/peer-review-i18n";
import {
  applyItemEdit,
  buildResponseLetterLatex,
  buildResponseLetterMarkdown,
  downloadTextFile,
  type PeerReviewItemEdit,
} from "@/lib/peer-review-letter";
import { useLatestRef } from "@/lib/use-latest-ref";

type StoredPeerReview = {
  comments: string;
  tone: ReviewTone;
  includeChanges: boolean;
  result: PeerReviewResult | null;
};

type InflightDraft = {
  controller: AbortController;
  promise: Promise<PeerReviewResult>;
};

const STORAGE_PREFIX = "peer_review_";
const COPIED_RESET_MS = 1600;

/** Requests survive tab switches (the panel unmounts); results land in sessionStorage. */
const inflightByProject = new Map<string, InflightDraft>();

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

function isItem(value: unknown): value is PeerReviewItem {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.quote === "string" &&
    typeof row.response === "string" &&
    typeof row.proposed_change === "string" &&
    REVIEW_CATEGORIES.includes(row.category as PeerReviewItem["category"])
  );
}

function parseResult(raw: unknown): PeerReviewResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.items)) return null;
  const items = obj.items.filter(isItem).map((item) => ({
    ...item,
    reviewer: typeof item.reviewer === "string" ? item.reviewer : null,
    summary: typeof item.summary === "string" ? item.summary : "",
    section_refs: Array.isArray(item.section_refs) ? item.section_refs.map(String) : [],
    unverified_numbers: Array.isArray(item.unverified_numbers)
      ? item.unverified_numbers.map(String)
      : [],
    quote_verified: item.quote_verified !== false,
    needs_author_input: Boolean(item.needs_author_input),
    draft_failed: Boolean(item.draft_failed),
  }));
  return {
    items,
    reviewers: Array.isArray(obj.reviewers) ? obj.reviewers.map(String) : [],
    letter_language: obj.letter_language === "vi" ? "vi" : "en",
    warnings: Array.isArray(obj.warnings) ? (obj.warnings as PeerReviewResult["warnings"]) : [],
    omitted_item_count: typeof obj.omitted_item_count === "number" ? obj.omitted_item_count : 0,
    provider: typeof obj.provider === "string" ? obj.provider : "",
    model: typeof obj.model === "string" ? obj.model : "",
  };
}

function loadStored(key: string): StoredPeerReview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      comments: typeof obj.comments === "string" ? obj.comments : "",
      tone: REVIEW_TONES.includes(obj.tone as ReviewTone) ? (obj.tone as ReviewTone) : "courteous",
      includeChanges: obj.includeChanges !== false,
      result: parseResult(obj.result),
    };
  } catch {
    return null;
  }
}

function saveStored(key: string, state: StoredPeerReview) {
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(state));
  } catch {
    /* storage full or unavailable — drafts stay in memory */
  }
}

function errorMessage(error: unknown, t: PeerReviewCopy, locale: UiLanguage): string {
  if (!(error instanceof PeerReviewApiError)) return t.errors.network;
  switch (error.code) {
    case "quota_exceeded":
      // Server quota messages are Vietnamese; show them verbatim only in the VI UI.
      return locale === "vi" && error.message ? error.message : t.errors.quota;
    case "llm_error":
      return t.errors.llm;
    case "parse_failed":
      return t.errors.parse;
    case "timeout":
      return t.errors.timeout;
    case "network":
      return t.errors.network;
    default:
      return error.message || t.errors.llm;
  }
}

export type UsePeerReviewOptions = {
  projectId: string;
  latex: string;
  locale: UiLanguage;
  llmProvider?: LLMProvider;
  llmModel?: string;
};

export function usePeerReview({
  projectId,
  latex,
  locale,
  llmProvider,
  llmModel,
}: UsePeerReviewOptions) {
  const key = projectId || "local";
  const t = peerReviewCopy(locale);
  const [initial] = useState(() => loadStored(key));
  const [comments, setComments] = useState(initial?.comments ?? "");
  const [tone, setTone] = useState<ReviewTone>(initial?.tone ?? "courteous");
  const [includeChanges, setIncludeChanges] = useState(initial?.includeChanges ?? true);
  const [result, setResult] = useState<PeerReviewResult | null>(initial?.result ?? null);
  const [loading, setLoading] = useState(() => inflightByProject.has(key));
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const mountedRef = useRef(false);
  const feedbackRef = useLatestRef({ t, locale });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    saveStored(key, { comments, tone, includeChanges, result });
  }, [key, comments, tone, includeChanges, result]);

  const subscribe = useCallback(
    (entry: InflightDraft) => {
      setLoading(true);
      entry.promise
        .then(
          (next) => {
            if (!mountedRef.current) return;
            setResult(next);
            setError(null);
          },
          (err: unknown) => {
            if (!mountedRef.current || entry.controller.signal.aborted) return;
            const { t: copy, locale: lang } = feedbackRef.current;
            setError(errorMessage(err, copy, lang));
          },
        )
        .finally(() => {
          if (mountedRef.current && !inflightByProject.has(key)) setLoading(false);
        });
    },
    [key, feedbackRef],
  );

  // Re-attach to a request started before the panel was last unmounted.
  useEffect(() => {
    const entry = inflightByProject.get(key);
    if (entry) subscribe(entry);
  }, [key, subscribe]);

  const draft = useCallback(() => {
    const text = comments.trim();
    if (!text || inflightByProject.has(key)) return;
    const controller = new AbortController();
    let entry: InflightDraft | null = null;
    const promise = draftPeerReviewResponses(
      {
        comments: text,
        latex_content: latex,
        session_id: projectId || undefined,
        locale,
        tone,
        llm_provider: llmProvider,
        llm_model: llmModel || undefined,
      },
      { signal: controller.signal, locale },
    )
      .then((next) => {
        // Persist even if the panel is unmounted by now.
        const stored = loadStored(key);
        saveStored(key, {
          comments: stored?.comments ?? text,
          tone: stored?.tone ?? tone,
          includeChanges: stored?.includeChanges ?? true,
          result: next,
        });
        return next;
      })
      .finally(() => {
        if (inflightByProject.get(key) === entry) inflightByProject.delete(key);
      });
    entry = { controller, promise };
    inflightByProject.set(key, entry);
    setError(null);
    subscribe(entry);
  }, [comments, key, latex, projectId, locale, tone, llmProvider, llmModel, subscribe]);

  const cancel = useCallback(() => {
    const entry = inflightByProject.get(key);
    if (entry) {
      entry.controller.abort();
      inflightByProject.delete(key);
    }
    setLoading(false);
  }, [key]);

  const clear = useCallback(() => {
    cancel();
    setComments("");
    setResult(null);
    setError(null);
  }, [cancel]);

  const updateItem = useCallback((id: string, patch: PeerReviewItemEdit) => {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item) => (item.id === id ? applyItemEdit(item, patch) : item)),
          }
        : prev,
    );
  }, []);

  const copyText = useCallback(
    async (text: string, copyKey: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(copyKey);
        window.setTimeout(() => {
          setCopiedKey((current) => (current === copyKey ? null : current));
        }, COPIED_RESET_MS);
      } catch {
        toast.error(feedbackRef.current.t.copyError);
      }
    },
    [feedbackRef],
  );

  const letterOptions = useMemo(
    () => ({
      labels: responseLetterLabels(result?.letter_language ?? "en"),
      includeChanges,
    }),
    [result?.letter_language, includeChanges],
  );

  const letterMarkdown = useMemo(
    () => (result ? buildResponseLetterMarkdown(result.items, letterOptions) : ""),
    [result, letterOptions],
  );

  const copyLetter = useCallback(() => {
    if (letterMarkdown) void copyText(letterMarkdown, "letter");
  }, [letterMarkdown, copyText]);

  const downloadMarkdown = useCallback(() => {
    if (!letterMarkdown) return;
    downloadTextFile("response-to-reviewers.md", letterMarkdown, "text/markdown;charset=utf-8");
  }, [letterMarkdown]);

  const downloadLatex = useCallback(() => {
    if (!result) return;
    downloadTextFile(
      "response-to-reviewers.tex",
      buildResponseLetterLatex(result.items, letterOptions),
      "application/x-tex;charset=utf-8",
    );
  }, [result, letterOptions]);

  return {
    t,
    comments,
    setComments,
    tone,
    setTone,
    includeChanges,
    setIncludeChanges,
    result,
    loading,
    error,
    copiedKey,
    draft,
    cancel,
    clear,
    updateItem,
    copyText,
    copyLetter,
    downloadMarkdown,
    downloadLatex,
  };
}
