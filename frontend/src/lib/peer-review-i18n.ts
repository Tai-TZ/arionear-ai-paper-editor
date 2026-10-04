import type {
  LetterLanguage,
  PeerReviewWarning,
  ReviewCategory,
  ReviewTone,
} from "@/lib/api/peer-review-api";
import type { UiLanguage } from "@/lib/locale-store";
import type { ResponseLetterLabels } from "@/lib/peer-review-letter";

export type PeerReviewCopy = {
  tab: string;
  title: string;
  intro: string;
  humanGate: string;
  commentsLabel: string;
  commentsPlaceholder: string;
  charCount: (count: number, limit: number) => string;
  overSoftLimit: string;
  toneLabel: string;
  tones: Record<ReviewTone, string>;
  draft: string;
  redraft: string;
  drafting: string;
  draftingHint: string;
  cancel: string;
  clear: string;
  clearConfirm: string;
  noItems: string;
  categories: Record<ReviewCategory, string>;
  reviewer: (label: string) => string;
  generalGroup: string;
  itemCount: (count: number) => string;
  needsInputCount: (count: number) => string;
  responseLabel: string;
  proposedChangeLabel: string;
  proposedChangeHint: string;
  needsInput: string;
  needsInputHint: string;
  checkNumbers: (numbers: string) => string;
  checkNumbersHint: string;
  quoteUnverified: string;
  quoteUnverifiedHint: string;
  draftFailed: string;
  draftFailedHint: string;
  sectionRefs: string;
  copyResponse: string;
  copied: string;
  copyLetter: string;
  letterCopied: string;
  downloadMd: string;
  downloadTex: string;
  includeChanges: string;
  copyError: string;
  warnings: Record<PeerReviewWarning, string>;
  omittedItems: (count: number) => string;
  errors: {
    quota: string;
    llm: string;
    parse: string;
    timeout: string;
    network: string;
  };
};

const COPY: Record<UiLanguage, PeerReviewCopy> = {
  en: {
    tab: "Peer review",
    title: "Peer-review response",
    intro:
      "Paste the reviewer comments you received. Ario splits them into individual points, classifies each one and drafts a polite, point-by-point response with a proposed change.",
    humanGate:
      "Drafts only — Ario never edits your manuscript. Review every response and fill in each [AUTHOR: …] placeholder before sending.",
    commentsLabel: "Reviewer comments",
    commentsPlaceholder:
      "Reviewer 1\n1. The sample size seems small…\n2. Please clarify…\n\nReviewer 2\n…",
    charCount: (count, limit) =>
      `${count.toLocaleString("en-US")} / ${limit.toLocaleString("en-US")} characters`,
    overSoftLimit: "Only the first part of very long comments is analysed.",
    toneLabel: "Tone",
    tones: {
      courteous: "Courteous",
      formal: "Formal",
      concise: "Concise",
      confident: "Confident",
    },
    draft: "Draft responses",
    redraft: "Draft again",
    drafting: "Drafting…",
    draftingHint: "Splitting comments and drafting responses — this can take a minute.",
    cancel: "Cancel",
    clear: "Clear",
    clearConfirm: "Clear the pasted comments and all drafted responses?",
    noItems: "No actionable reviewer points were found in the pasted text.",
    categories: {
      major: "Major",
      minor: "Minor",
      editorial: "Editorial",
      question: "Question",
    },
    reviewer: (label) => {
      const match = /^R(\d+)$/i.exec(label);
      if (match) return `Reviewer ${match[1]}`;
      return label.toLowerCase() === "editor" ? "Editor" : label;
    },
    generalGroup: "General comments",
    itemCount: (count) => `${count} ${count === 1 ? "point" : "points"}`,
    needsInputCount: (count) => `${count} need${count === 1 ? "s" : ""} your input`,
    responseLabel: "Draft response",
    proposedChangeLabel: "Proposed change",
    proposedChangeHint: "Not applied — make this change in the editor yourself.",
    needsInput: "Needs your input",
    needsInputHint: "Contains [AUTHOR: …] placeholders for facts only you can provide.",
    checkNumbers: (numbers) => `Check numbers: ${numbers}`,
    checkNumbersHint: "These numbers do not appear in the manuscript or the comment — verify them.",
    quoteUnverified: "Quote not verbatim",
    quoteUnverifiedHint: "This quote could not be matched exactly to the pasted comments.",
    draftFailed: "Draft failed",
    draftFailedHint: "Ario could not draft this response — write it yourself or draft again.",
    sectionRefs: "Sections",
    copyResponse: "Copy response",
    copied: "Copied",
    copyLetter: "Copy letter (Markdown)",
    letterCopied: "Letter copied",
    downloadMd: ".md",
    downloadTex: ".tex",
    includeChanges: "Include proposed changes in the letter",
    copyError: "Could not copy to the clipboard.",
    warnings: {
      comments_truncated: "The comments were long — only the first part was analysed.",
      manuscript_truncated: "The manuscript was long — Ario read a shortened version.",
      items_capped: "Too many points — only the first ones were drafted.",
      split_fallback:
        "Ario split the comments with a simple rule-based fallback; check the grouping and categories.",
      draft_partial: "Some responses could not be drafted — they are marked below.",
    },
    omittedItems: (count) => `${count} more ${count === 1 ? "point was" : "points were"} skipped.`,
    errors: {
      quota: "You have reached your AI usage limit. Try again later.",
      llm: "The AI provider is unavailable right now. Try again or switch model.",
      parse: "Ario could not produce valid drafts this time. Please try again.",
      timeout: "Drafting took too long. Try again with fewer comments.",
      network: "Network error — check your connection and try again.",
    },
  },
  vi: {
    tab: "Phản biện",
    title: "Phản hồi phản biện",
    intro:
      "Dán nhận xét của reviewer bạn nhận được. Ario tách thành từng ý, phân loại và soạn nháp câu trả lời lịch sự cho từng ý kèm đề xuất chỉnh sửa.",
    humanGate:
      "Chỉ là bản nháp — Ario không bao giờ sửa bản thảo của bạn. Hãy đọc lại mọi câu trả lời và điền các chỗ [AUTHOR: …] trước khi gửi.",
    commentsLabel: "Nhận xét của reviewer",
    commentsPlaceholder: "Reviewer 1\n1. Cỡ mẫu có vẻ nhỏ…\n2. Đề nghị làm rõ…\n\nReviewer 2\n…",
    charCount: (count, limit) =>
      `${count.toLocaleString("vi-VN")} / ${limit.toLocaleString("vi-VN")} ký tự`,
    overSoftLimit: "Với nhận xét quá dài, Ario chỉ phân tích phần đầu.",
    toneLabel: "Giọng văn",
    tones: {
      courteous: "Lịch sự",
      formal: "Trang trọng",
      concise: "Ngắn gọn",
      confident: "Tự tin",
    },
    draft: "Soạn câu trả lời",
    redraft: "Soạn lại",
    drafting: "Đang soạn…",
    draftingHint: "Đang tách nhận xét và soạn câu trả lời — có thể mất khoảng một phút.",
    cancel: "Hủy",
    clear: "Xóa",
    clearConfirm: "Xóa nhận xét đã dán và toàn bộ câu trả lời đã soạn?",
    noItems: "Không tìm thấy ý nhận xét nào cần trả lời trong đoạn văn đã dán.",
    categories: {
      major: "Lớn",
      minor: "Nhỏ",
      editorial: "Biên tập",
      question: "Câu hỏi",
    },
    reviewer: (label) => {
      const match = /^R(\d+)$/i.exec(label);
      if (match) return `Reviewer ${match[1]}`;
      return label.toLowerCase() === "editor" ? "Biên tập viên" : label;
    },
    generalGroup: "Nhận xét chung",
    itemCount: (count) => `${count} ý`,
    needsInputCount: (count) => `${count} ý cần bạn bổ sung`,
    responseLabel: "Câu trả lời nháp",
    proposedChangeLabel: "Đề xuất chỉnh sửa",
    proposedChangeHint: "Chưa được áp dụng — bạn tự chỉnh trong trình soạn thảo.",
    needsInput: "Cần bạn bổ sung",
    needsInputHint: "Có chỗ [AUTHOR: …] cho thông tin chỉ bạn mới biết.",
    checkNumbers: (numbers) => `Kiểm tra số liệu: ${numbers}`,
    checkNumbersHint: "Các số này không có trong bản thảo hoặc nhận xét — hãy kiểm tra lại.",
    quoteUnverified: "Trích dẫn chưa khớp",
    quoteUnverifiedHint: "Không khớp chính xác đoạn trích này với nhận xét đã dán.",
    draftFailed: "Soạn thất bại",
    draftFailedHint: "Ario chưa soạn được câu trả lời này — hãy tự viết hoặc soạn lại.",
    sectionRefs: "Mục liên quan",
    copyResponse: "Sao chép câu trả lời",
    copied: "Đã sao chép",
    copyLetter: "Sao chép thư (Markdown)",
    letterCopied: "Đã sao chép thư",
    downloadMd: ".md",
    downloadTex: ".tex",
    includeChanges: "Kèm đề xuất chỉnh sửa trong thư",
    copyError: "Không sao chép được vào clipboard.",
    warnings: {
      comments_truncated: "Nhận xét quá dài — Ario chỉ phân tích phần đầu.",
      manuscript_truncated: "Bản thảo dài — Ario đọc bản rút gọn.",
      items_capped: "Quá nhiều ý — Ario chỉ soạn cho các ý đầu tiên.",
      split_fallback:
        "Ario tách nhận xét bằng quy tắc dự phòng đơn giản; hãy kiểm tra lại cách nhóm và phân loại.",
      draft_partial: "Một số câu trả lời chưa soạn được — đã được đánh dấu bên dưới.",
    },
    omittedItems: (count) => `Bỏ qua thêm ${count} ý.`,
    errors: {
      quota: "Bạn đã dùng hết hạn mức AI. Vui lòng thử lại sau.",
      llm: "Nhà cung cấp AI đang gián đoạn. Thử lại hoặc đổi model.",
      parse: "Lần này Ario chưa tạo được bản nháp hợp lệ. Vui lòng thử lại.",
      timeout: "Soạn quá lâu. Hãy thử lại với ít nhận xét hơn.",
      network: "Lỗi mạng — kiểm tra kết nối và thử lại.",
    },
  },
};

export function peerReviewCopy(locale: UiLanguage): PeerReviewCopy {
  return COPY[locale];
}

const LETTER_LABELS: Record<LetterLanguage, ResponseLetterLabels> = {
  en: {
    title: "Response to Reviewers",
    intro:
      "We thank the editor and the reviewers for their careful reading of our manuscript and their constructive comments. Below we respond to each comment point by point; the reviewers' comments are quoted, followed by our response.",
    reviewer: (label) => {
      const match = /^R(\d+)$/i.exec(label);
      if (match) return `Reviewer ${match[1]}`;
      return label.toLowerCase() === "editor" ? "Editor" : label;
    },
    general: "General comments",
    comment: (index) => `Comment ${index}`,
    categories: { major: "Major", minor: "Minor", editorial: "Editorial", question: "Question" },
    response: "Response",
    changes: "Changes to the manuscript",
    missingResponse: "[AUTHOR: write the response to this comment]",
  },
  vi: {
    title: "Phản hồi ý kiến phản biện",
    intro:
      "Chúng tôi xin chân thành cảm ơn Ban biên tập và các phản biện đã đọc kỹ bản thảo và đưa ra những góp ý xác đáng. Dưới đây chúng tôi trả lời lần lượt từng ý kiến; nhận xét của phản biện được trích dẫn, tiếp theo là phần trả lời của chúng tôi.",
    reviewer: (label) => {
      const match = /^R(\d+)$/i.exec(label);
      if (match) return `Phản biện ${match[1]}`;
      return label.toLowerCase() === "editor" ? "Ban biên tập" : label;
    },
    general: "Nhận xét chung",
    comment: (index) => `Ý kiến ${index}`,
    categories: { major: "Lớn", minor: "Nhỏ", editorial: "Biên tập", question: "Câu hỏi" },
    response: "Trả lời",
    changes: "Chỉnh sửa trong bản thảo",
    missingResponse: "[AUTHOR: viết câu trả lời cho ý kiến này]",
  },
};

/** Labels for the exported letter — follows the reviewers' language, not the UI language. */
export function responseLetterLabels(language: LetterLanguage): ResponseLetterLabels {
  return LETTER_LABELS[language] ?? LETTER_LABELS.en;
}
