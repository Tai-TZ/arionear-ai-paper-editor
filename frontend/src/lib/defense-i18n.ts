import type { UiLanguage } from "@/lib/locale-store";

export type DefenseCopy = {
  masthead: {
    backToProject: string;
    modeLabel: string;
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
    modeSection: string;
    proactiveTitle: string;
    proactiveDesc: string;
    responsiveTitle: string;
    responsiveDesc: string;
    startButton: string;
    footnoteLine1: string;
    footnoteLine2: string;
    turnLabel: (n: number) => string;
    turnsUsed: (used: number, limit: number, periodType: "daily" | "monthly") => string;
    quotaFree: string;
    quotaPro: string;
    quotaExceededDaily: string;
    quotaExceededMonthly: string;
    quotaWaitTomorrow: string;
    upgradeHint: string;
    quotaUpgradeCta: string;
    thinkingDefault: string;
    composerHint: string;
    composerProactive: string;
    composerResponsive: string;
    send: string;
    stop: string;
    userLabel: string;
    sessionTurns: (n: number) => string;
  };
};

const COPY: Record<UiLanguage, DefenseCopy> = {
  en: {
    masthead: {
      backToProject: "Project",
      modeLabel: "Defense mode",
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
      modeSection: "Choose defense mode",
      proactiveTitle: "Proactive review",
      proactiveDesc: "The council reads your paper and asks questions with rising difficulty.",
      responsiveTitle: "Open Q&A",
      responsiveDesc: "You raise concerns; the council analyzes and probes deeper.",
      startButton: "Invite council review",
      footnoteLine1: "Simulates a viva with an experienced professor persona.",
      footnoteLine2: "One question per turn — from overview to technical detail.",
      turnLabel: (n) => `Question ${n}`,
      turnsUsed: (used, limit, periodType) =>
        periodType === "daily"
          ? `${used}/${limit} turns today`
          : `${used}/${limit} turns this month`,
      quotaFree: "Free",
      quotaPro: "Pro",
      quotaExceededDaily: "You have used all free defense turns for today.",
      quotaExceededMonthly: "You have used all defense turns for this month.",
      quotaWaitTomorrow: "Come back tomorrow for a fresh daily allowance, or upgrade to Pro.",
      upgradeHint: "Upgrade to Pro for more defense turns.",
      quotaUpgradeCta: "Upgrade to Pro",
      thinkingDefault: "Analyzing the research paper...",
      composerHint: "Enter to send · Shift+Enter for new line",
      composerProactive: "Answer the council's question...",
      composerResponsive: "Raise a concern about the paper...",
      send: "Send",
      stop: "Stop",
      userLabel: "You",
      sessionTurns: (n) => `${n} turns`,
    },
  },
  vi: {
    masthead: {
      backToProject: "Dự án",
      modeLabel: "Chế độ phản biện",
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
      modeSection: "Chọn chế độ phản biện",
      proactiveTitle: "Phản biện chủ động",
      proactiveDesc: "Hội đồng tự đọc bài và đặt câu hỏi, tăng dần độ khó.",
      responsiveTitle: "Hỏi đáp tự do",
      responsiveDesc: "Bạn nêu điểm lo ngại, hội đồng phân tích và khai thác sâu.",
      startButton: "Mời hội đồng phản biện",
      footnoteLine1: "Mô phỏng phiên vấn đáp với persona giáo sư kinh nghiệm.",
      footnoteLine2: "Mỗi lượt một câu — từ tổng quan đến chi tiết kỹ thuật.",
      turnLabel: (n) => `Câu ${n}`,
      turnsUsed: (used, limit, periodType) =>
        periodType === "daily"
          ? `${used}/${limit} lượt hôm nay`
          : `${used}/${limit} lượt trong tháng`,
      quotaFree: "Free",
      quotaPro: "Pro",
      quotaExceededDaily: "Bạn đã hết 5 lượt phản biện miễn phí hôm nay.",
      quotaExceededMonthly: "Bạn đã hết lượt phản biện trong tháng này.",
      quotaWaitTomorrow: "Quay lại vào ngày mai để được reset, hoặc nâng cấp Pro.",
      upgradeHint: "Nâng cấp Pro để có thêm lượt phản biện.",
      quotaUpgradeCta: "Nâng cấp Pro",
      thinkingDefault: "Đang phân tích bài nghiên cứu...",
      composerHint: "Enter gửi · Shift+Enter xuống dòng",
      composerProactive: "Trả lời câu hỏi của hội đồng...",
      composerResponsive: "Nêu điểm lo ngại của bạn về bài nghiên cứu...",
      send: "Gửi",
      stop: "Dừng",
      userLabel: "Bạn",
      sessionTurns: (n) => `${n} lượt`,
    },
  },
};

export function defenseCopy(locale: UiLanguage): DefenseCopy {
  return COPY[locale];
}

export function isDefenseQuotaError(message: string): boolean {
  return message.startsWith("DEFENSE_QUOTA_DAILY") || message.startsWith("DEFENSE_QUOTA_MONTHLY");
}

export function formatDefenseQuotaError(message: string, copy: DefenseCopy["chat"]): string {
  if (message.startsWith("DEFENSE_QUOTA_DAILY")) {
    return `${copy.quotaExceededDaily} ${copy.quotaWaitTomorrow}`;
  }
  if (message.startsWith("DEFENSE_QUOTA_MONTHLY")) {
    return `${copy.quotaExceededMonthly} ${copy.upgradeHint}`;
  }
  return message;
}
