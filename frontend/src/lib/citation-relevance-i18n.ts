import type { UiLanguage } from "@/lib/locale-store";
import type {
  CitationRelevanceReason,
  CitationRelevanceVerdict,
} from "@/lib/api/citation-relevance-api";

export type CitationRelevanceCopy = {
  title: string;
  intro: string;
  run: string;
  running: string;
  needsVerification: string;
  error: string;
  capped: (checked: number, total: number) => string;
  summary: (counts: Record<CitationRelevanceVerdict, number>) => string;
  verdict: Record<CitationRelevanceVerdict, string>;
  reason: Record<Exclude<CitationRelevanceReason, "judged">, string>;
  claim: string;
  source: string;
  confidence: (percent: number) => string;
  sourceLabel: Record<"openalex" | "semantic_scholar", string>;
};

const EN: CitationRelevanceCopy = {
  title: "Relevance (L4)",
  intro:
    "AI compares each verified citation's abstract with the sentence that cites it. Read-only — your manuscript is never changed.",
  run: "Check relevance (L4)",
  running: "Checking relevance…",
  needsVerification: "Verify citations first — relevance is checked for verified citations only.",
  error: "Could not check citation relevance right now. Please try again later.",
  capped: (checked, total) => `Checked the first ${checked} of ${total} verified citations.`,
  summary: (c) =>
    `${c.supports} supports · ${c.partial} partial · ${c.unrelated} unrelated · ${c.insufficient_info} insufficient info`,
  verdict: {
    supports: "Supports",
    partial: "Partial",
    unrelated: "Unrelated",
    insufficient_info: "Insufficient info",
  },
  reason: {
    not_cited: "No \\cite of this key was found in the main file, so there is no claim to check.",
    no_abstract: "No abstract is available from OpenAlex or Semantic Scholar — not judged.",
    llm_error: "The AI model did not respond in time — try again.",
    invalid_output: "The AI answer could not be validated, so no verdict is shown.",
  },
  claim: "Claim",
  source: "Source",
  confidence: (percent) => `confidence ${percent}%`,
  sourceLabel: { openalex: "OpenAlex", semantic_scholar: "Semantic Scholar" },
};

const VI: CitationRelevanceCopy = {
  title: "Độ liên quan (L4)",
  intro:
    "AI so sánh tóm tắt (abstract) của từng trích dẫn đã xác minh với câu trích dẫn nó. Chỉ đọc — bản thảo không bao giờ bị thay đổi.",
  run: "Kiểm tra liên quan (L4)",
  running: "Đang kiểm tra liên quan…",
  needsVerification:
    "Hãy xác minh trích dẫn trước — chỉ kiểm tra độ liên quan cho trích dẫn đã xác minh.",
  error: "Không thể kiểm tra độ liên quan lúc này. Vui lòng thử lại sau.",
  capped: (checked, total) =>
    `Đã kiểm tra ${checked} trích dẫn đầu tiên trên tổng số ${total} trích dẫn đã xác minh.`,
  summary: (c) =>
    `${c.supports} ủng hộ · ${c.partial} một phần · ${c.unrelated} không liên quan · ${c.insufficient_info} chưa đủ thông tin`,
  verdict: {
    supports: "Ủng hộ",
    partial: "Một phần",
    unrelated: "Không liên quan",
    insufficient_info: "Chưa đủ thông tin",
  },
  reason: {
    not_cited:
      "Không tìm thấy \\cite của khóa này trong file chính nên không có luận điểm để kiểm tra.",
    no_abstract: "OpenAlex và Semantic Scholar không có abstract — không đánh giá.",
    llm_error: "Mô hình AI không phản hồi kịp — hãy thử lại.",
    invalid_output: "Không xác thực được câu trả lời của AI nên không hiển thị kết luận.",
  },
  claim: "Luận điểm",
  source: "Nguồn",
  confidence: (percent) => `độ tin cậy ${percent}%`,
  sourceLabel: { openalex: "OpenAlex", semantic_scholar: "Semantic Scholar" },
};

export function citationRelevanceCopy(locale: UiLanguage): CitationRelevanceCopy {
  return locale === "vi" ? VI : EN;
}
