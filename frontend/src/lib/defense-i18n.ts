import type { UiLanguage } from "@/lib/locale-store";

export type DefenseCopy = {
  masthead: {
    backToProject: string;
  };
  loading: string;
  loadErrorBack: string;
  chat: {
    councilBrand: string;
    councilTitle: string;
    councilSubtitle: string;
    resetSession: string;
    resetTooltip: string;
    paperLabel: string;
    proactiveTitle: string;
    proactiveDesc: string;
    startButton: string;
    footnoteLine1: string;
    footnoteLine2: string;
    turnLabel: (n: number) => string;
    turnsUsed: (used: number, limit: number) => string;
    quotaFree: string;
    quotaPro: string;
    quotaPeriodDaily: string;
    quotaExceededDaily: string;
    quotaExceededPro: string;
    quotaWaitTomorrow: string;
    quotaWaitReset: string;
    quotaUpgradeCta: string;
    quotaResetAt: (time: string) => string;
    quotaResetCountdown: (remaining: string) => string;
    quotaLoadError: string;
    quotaLoadRetry: string;
    thinkingDefault: string;
    thinkingFollowUp: string;
    streamInterrupted: string;
    stopCancelled: string;
    resetConfirmTitle: string;
    resetConfirmDesc: string;
    resetConfirmYes: string;
    resetConfirmNo: string;
    previousSession: string;
    previousSessionTurns: (n: number) => string;
    resumeSession: string;
    newSession: string;
    compileFailed: string;
    compileNetworkError: string;
    paperLoadFallbackError: string;
    composerHint: string;
    composerPlaceholder: string;
    send: string;
    stop: string;
    userLabel: string;
  };
};

const COPY: Record<UiLanguage, DefenseCopy> = {
  en: {
    masthead: {
      backToProject: "Project",
    },
    loading: "Loading research paper...",
    loadErrorBack: "Back to projects",
    chat: {
      councilBrand: "Ario",
      councilTitle: " Defense",
      councilSubtitle: "Mock viva session",
      resetSession: "Restart session",
      resetTooltip: "Restart session",
      paperLabel: "Research paper",
      proactiveTitle: "Proactive review",
      proactiveDesc: "The council reads your paper and asks questions with rising difficulty.",
      startButton: "Invite council review",
      footnoteLine1: "Simulates a viva — one question per turn, rising difficulty.",
      footnoteLine2: "Answer clearly. The council will probe further.",
      turnLabel: (n) => `Question ${n}`,
      turnsUsed: (used, limit) => `${used}/${limit} turns today`,
      quotaFree: "Free",
      quotaPro: "Pro",
      quotaPeriodDaily: "today",
      quotaExceededDaily: "You have used all free defense turns for today.",
      quotaExceededPro: "You have used all 50 Pro defense turns for today.",
      quotaWaitTomorrow: "Come back after 23:59:59 for a fresh daily allowance, or upgrade to Pro.",
      quotaWaitReset: "Your quota resets at 23:59:59.",
      quotaUpgradeCta: "Upgrade to Pro",
      quotaResetAt: (time) => `Resets at ${time}`,
      quotaResetCountdown: (remaining) => `Time until reset: ${remaining}`,
      quotaLoadError: "Could not load quota. Sends may be blocked by the server.",
      quotaLoadRetry: "Retry",
      thinkingDefault: "Analyzing the research paper...",
      thinkingFollowUp: "Preparing the next question...",
      streamInterrupted: "Stream interrupted. Please try again.",
      stopCancelled: "— stopped —",
      resetConfirmTitle: "Restart session?",
      resetConfirmDesc: "This will clear the current conversation.",
      resetConfirmYes: "Restart",
      resetConfirmNo: "Cancel",
      previousSession: "Previous session",
      previousSessionTurns: (n) => `${n} ${n === 1 ? "turn" : "turns"}`,
      resumeSession: "Resume session",
      newSession: "Start new",
      compileFailed: "Compile failed.",
      compileNetworkError: "Could not compile PDF.",
      paperLoadFallbackError: "Failed to load paper.",
      composerHint: "Enter to send · Shift+Enter for new line",
      composerPlaceholder: "Answer the council's question...",
      send: "Send",
      stop: "Stop",
      userLabel: "You",
    },
  },
  vi: {
    masthead: {
      backToProject: "Dự án",
    },
    loading: "Đang tải bài nghiên cứu...",
    loadErrorBack: "Quay lại danh sách bài",
    chat: {
      councilBrand: "Ario",
      councilTitle: " phản biện",
      councilSubtitle: "Mô phỏng vấn đáp hội đồng",
      resetSession: "Bắt đầu lại",
      resetTooltip: "Bắt đầu lại phiên",
      paperLabel: "Bài nghiên cứu",
      proactiveTitle: "Phản biện chủ động",
      proactiveDesc: "Hội đồng tự đọc bài và đặt câu hỏi, tăng dần độ khó.",
      startButton: "Mời hội đồng phản biện",
      footnoteLine1: "Mô phỏng vấn đáp — mỗi lượt một câu, tăng dần độ khó.",
      footnoteLine2: "Trả lời rõ ràng. Hội đồng sẽ tiếp tục khai thác sâu hơn.",
      turnLabel: (n) => `Câu ${n}`,
      turnsUsed: (used, limit) => `${used}/${limit} lượt hôm nay`,
      quotaFree: "Free",
      quotaPro: "Pro",
      quotaPeriodDaily: "hôm nay",
      quotaExceededDaily: "Bạn đã hết 5 lượt phản biện miễn phí hôm nay.",
      quotaExceededPro: "Bạn đã hết 50 lượt phản biện Pro hôm nay.",
      quotaWaitTomorrow: "Quay lại sau 23:59:59 để được reset, hoặc nâng cấp Pro.",
      quotaWaitReset: "Lượt phản biện reset lúc 23:59:59.",
      quotaUpgradeCta: "Nâng cấp Pro",
      quotaResetAt: (time) => `Reset lúc ${time}`,
      quotaResetCountdown: (remaining) => `Còn ${remaining}`,
      quotaLoadError: "Không tải được quota. Backend sẽ chặn nếu hết lượt.",
      quotaLoadRetry: "Thử lại",
      thinkingDefault: "Đang phân tích bài nghiên cứu...",
      thinkingFollowUp: "Đang soạn câu hỏi tiếp theo...",
      streamInterrupted: "Kết nối stream bị gián đoạn. Vui lòng thử lại.",
      stopCancelled: "— đã dừng —",
      resetConfirmTitle: "Bắt đầu lại?",
      resetConfirmDesc: "Toàn bộ hội thoại hiện tại sẽ bị xóa.",
      resetConfirmYes: "Bắt đầu lại",
      resetConfirmNo: "Huỷ",
      previousSession: "Phiên trước",
      previousSessionTurns: (n) => `${n} lượt`,
      resumeSession: "Tiếp tục phiên trước",
      newSession: "Bắt đầu mới",
      compileFailed: "Biên dịch thất bại.",
      compileNetworkError: "Không thể biên dịch PDF.",
      paperLoadFallbackError: "Không tải được bài nghiên cứu.",
      composerHint: "Enter gửi · Shift+Enter xuống dòng",
      composerPlaceholder: "Trả lời câu hỏi của hội đồng...",
      send: "Gửi",
      stop: "Dừng",
      userLabel: "Bạn",
    },
  },
};

export function defenseCopy(locale: UiLanguage): DefenseCopy {
  return COPY[locale];
}

export function isDefenseQuotaError(message: string): boolean {
  return (
    message.startsWith("DEFENSE_QUOTA_DAILY") ||
    message.startsWith("DEFENSE_QUOTA_MONTHLY") ||
    message.startsWith("FREE_QUOTA_EXCEEDED") ||
    message.startsWith("PRO_QUOTA_EXCEEDED")
  );
}

export function formatDefenseQuotaError(message: string, copy: DefenseCopy["chat"]): string {
  if (message.startsWith("FREE_QUOTA_EXCEEDED") || message.startsWith("DEFENSE_QUOTA_DAILY")) {
    return `${copy.quotaExceededDaily} ${copy.quotaWaitTomorrow}`;
  }
  if (message.startsWith("PRO_QUOTA_EXCEEDED") || message.startsWith("DEFENSE_QUOTA_MONTHLY")) {
    return `${copy.quotaExceededPro} ${copy.quotaWaitReset}`;
  }
  return message;
}
