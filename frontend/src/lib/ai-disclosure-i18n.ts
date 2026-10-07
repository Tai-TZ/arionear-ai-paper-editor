import type { UiLanguage } from "@/lib/researcher-profile";

export function aiDisclosureCopy(locale: UiLanguage) {
  return locale === "vi" ? VI : EN;
}

export type AiDisclosureCopy = typeof EN;

const EN = {
  eyebrow: "Declaration",
  title: "AI disclosure",
  description:
    "A deterministic record of how Edico's AI assisted this paper, built from your accept/reject history. Nothing is inserted into your manuscript — copy what your journal requires.",
  generate: "Generate AI disclosure",
  refresh: "Refresh",
  loading: "Building the report…",
  loadError: "Could not load the AI disclosure report.",
  retry: "Retry",
  noUsage: "No AI assistance from Edico was recorded for this paper.",
  statementLabel: "Disclosure statement",
  latexLabel: "LaTeX snippet (declaration section)",
  languageGroup: "Statement language",
  languages: { en: "EN", vi: "VI" } as Record<UiLanguage, string>,
  languageNames: { en: "English", vi: "Vietnamese" } as Record<UiLanguage, string>,
  copyStatement: "Copy statement",
  copyLatex: "Copy LaTeX",
  downloadJson: "Download JSON",
  copied: "Copied",
  copyError: "Could not copy to the clipboard.",
  stats: {
    interactions: "AI interactions",
    proposed: "Suggestions",
    accepted: "Accepted",
    rejected: "Rejected",
    pending: "Undecided",
  },
  modifiedNote: (n: number) => `incl. ${n} modified`,
  byTask: "By task",
  taskSummary: (interactions: number, proposed: number, accepted: number, rejected: number) =>
    `${interactions} interaction${interactions === 1 ? "" : "s"} · ${proposed} proposed · ${accepted} accepted · ${rejected} rejected`,
  tasks: {
    style: "Language & style",
    edit: "Text edits",
    structure: "Structure analysis",
    template: "LaTeX template",
    citation: "Citation check",
    logic: "Logic audit",
    chat: "Q&A chat",
  } as Record<string, string>,
  unattributed: (n: number) =>
    `${n} suggestion${n === 1 ? "" : "s"} could not be linked to a task.`,
  inferred: (n: number) =>
    `${n} older suggestion${n === 1 ? " was" : "s were"} matched to a task by timestamp.`,
  models: "Models",
  noModels: "Not recorded",
  period: "Period",
  humanGate:
    "Review and adapt the statement to your journal's policy before adding it to the manuscript.",
};

const VI: AiDisclosureCopy = {
  eyebrow: "Tuyên bố",
  title: "Tuyên bố sử dụng AI",
  description:
    "Bản ghi xác định về cách AI của Edico đã hỗ trợ bài báo này, được tổng hợp từ lịch sử chấp nhận/từ chối của bạn. Không có nội dung nào được tự động chèn vào bản thảo — hãy sao chép phần tạp chí yêu cầu.",
  generate: "Tạo tuyên bố sử dụng AI",
  refresh: "Làm mới",
  loading: "Đang tổng hợp báo cáo…",
  loadError: "Không tải được báo cáo tuyên bố sử dụng AI.",
  retry: "Thử lại",
  noUsage: "Không ghi nhận hỗ trợ AI nào từ Edico cho bài báo này.",
  statementLabel: "Nội dung tuyên bố",
  latexLabel: "Đoạn LaTeX (mục tuyên bố)",
  languageGroup: "Ngôn ngữ tuyên bố",
  languages: { en: "EN", vi: "VI" },
  languageNames: { en: "Tiếng Anh", vi: "Tiếng Việt" },
  copyStatement: "Sao chép tuyên bố",
  copyLatex: "Sao chép LaTeX",
  downloadJson: "Tải JSON",
  copied: "Đã sao chép",
  copyError: "Không sao chép được vào bộ nhớ tạm.",
  stats: {
    interactions: "Lượt dùng AI",
    proposed: "Đề xuất",
    accepted: "Chấp nhận",
    rejected: "Từ chối",
    pending: "Chưa quyết định",
  },
  modifiedNote: (n: number) => `gồm ${n} đã sửa`,
  byTask: "Theo tác vụ",
  taskSummary: (interactions: number, proposed: number, accepted: number, rejected: number) =>
    `${interactions} lượt · ${proposed} đề xuất · ${accepted} chấp nhận · ${rejected} từ chối`,
  tasks: {
    style: "Ngôn ngữ & văn phong",
    edit: "Chỉnh sửa văn bản",
    structure: "Phân tích cấu trúc",
    template: "Khung mẫu LaTeX",
    citation: "Kiểm tra trích dẫn",
    logic: "Rà soát logic",
    chat: "Hỏi đáp",
  },
  unattributed: (n: number) => `${n} đề xuất không xác định được tác vụ.`,
  inferred: (n: number) => `${n} đề xuất cũ được gán tác vụ theo thời điểm tạo.`,
  models: "Mô hình",
  noModels: "Không ghi nhận",
  period: "Thời gian",
  humanGate:
    "Hãy xem lại và điều chỉnh tuyên bố theo chính sách của tạp chí trước khi đưa vào bản thảo.",
};
