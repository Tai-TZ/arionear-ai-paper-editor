import type { UiLanguage } from "@/lib/researcher-profile";
import { localeBcp47 } from "@/lib/date-i18n";
import type { LogicAuditMode, LogicAuditScope } from "@/lib/logic-audit";

export type EditorCopy = {
  masthead: {
    projects: string;
    profile: string;
    latexWorkspace: string;
    integrityGuard: string;
    integrityOn: string;
    integrityStrict: string;
    integrityRelaxed: string;
  };
  sidebar: {
    files: string;
    chats: string;
    fileTree: string;
    outline: string;
    mainBadge: string;
    aiDisclaimer: string;
    uploadFiles: string;
    uploadFolder: string;
    importZip: string;
    emptyTree: string;
    fileActions: string;
    newChat: string;
    noChats: string;
    defaultChatTitle: string;
    renameChat: string;
    deleteChat: string;
    deleteChatConfirm: string;
  };
  assetPreview: {
    download: string;
    missing: string;
  };
  toolbar: {
    share: string;
    export: string;
    score: string;
    defense: string;
    tools: string;
    exportPdf: string;
    compileBeforeExport: string;
  };
  statusBar: {
    saved: string;
    latex: string;
    utf8: string;
    line: (n: number) => string;
    editor: string;
  };
  pdf: {
    compile: string;
    compiling: string;
    noPdfYet: string;
    pagesOf: (current: number, total: number) => string;
    readOnlyEmptyHint: string;
    fit: string;
    emptyHint: string;
    compilerAuto: string;
    log: string;
    findInPdf: string;
    search: string;
    searching: string;
    searchNoMatches: string;
    searchMatchOf: (current: number, total: number) => string;
    searchPrev: string;
    searchNext: string;
  };
  tools: {
    projectInfo: string;
    logicAudit: string;
    citations: string;
    versions: string;
    close: string;
    settings: string;
    autoCompile: string;
    autoCompileHint: string;
    researcherProfile: string;
    researcherProfileHint: string;
    open: string;
    darkMode: string;
    darkModeHint: string;
    summary: string;
    stats: {
      words: string;
      wordsInText: string;
      wordsInHeaders: string;
      wordsOutsideText: string;
      headers: string;
      figures: string;
      mathInlines: string;
      mathDisplayed: string;
    };
    citationVerification: string;
    verifyCitations: string;
    verifying: string;
    noTitleInBib: string;
    aiRevisionHistory: string;
    versionsHelp: string;
    revisionsHint: string;
    noRevisions: string;
    revisionAccepted: string;
    revisionRejected: string;
    revisionModified: string;
    revisionPending: string;
    charsVsOriginal: string;
    noCitationOnFile: string;
    noCitationsInManuscript: string;
    verifiedCitations: (verified: number, total: number) => string;
    citationVerifyError: string;
  };
  share: {
    circulationDesk: string;
    title: string;
    description: string;
    viewOnly: string;
    viewOnlyHint: string;
    stableLink: string;
    stableLinkHint: string;
    viewOnlyLink: string;
    copied: string;
    copyLink: string;
    disableHint: string;
    disableSharing: string;
    bulletPermanent: string;
    bulletLive: string;
    createLink: string;
    loadError: string;
    createError: string;
    disableError: string;
    copyError: string;
  };
  logicAudit: {
    intro: string;
    modeQuick: string;
    modeDeep: string;
    modeQuickSubtitle: string;
    modeDeepSubtitle: string;
    scanFull: string;
    scanFullHintQuick: (count: number) => string;
    scanFullHintDeep: (count: number) => string;
    hintQuickSelected: string;
    hintDeepSelected: string;
    hintQuickFull: string;
    hintDeepFull: string;
    pickOneSection: string;
    pickSections: string;
    selectAll: string;
    imradDefault: string;
    willScanParts: (count: number) => string;
    running: string;
    runQuick: string;
    runDeep: string;
    runQuickFull: string;
    runDeepFull: string;
    chatHint: string;
    noIssues: string;
    severityCritical: string;
    severityWarning: string;
    severityInfo: string;
    crossSection: string;
    weak: string;
  };
  llm: {
    paidBadge: string;
    paidChatPlaceholder: string;
    paidChatHint: string;
  };
  scoreGate: {
    eyebrow: string;
    title: string;
    description: string;
    totalScore: string;
    withAgent: string;
    heuristicOnly: string;
    compileErrorBanner: string;
    reviewSummary: string;
    note: string;
    staleWarning: string;
    criteria: string;
    footerLoading: string;
    footerCompileError: string;
    footerReady: string;
    downloadBtn: string;
    evaluating: string;
    errorTitle: string;
    dimStructure: string;
    dimCompleteness: string;
    dimCitations: string;
    dimLogic: string;
    gradeExcellent: string;
    gradeGood: string;
    gradeFair: string;
    gradeNeedsWork: string;
    gradeFailing: string;
    gradeEvaluating: string;
    hintLoading: string;
  };
  mobile: {
    files: string;
    editor: string;
    preview: string;
  };
};

const EN: EditorCopy = {
  masthead: {
    projects: "Projects",
    profile: "Profile",
    latexWorkspace: "LaTeX Workspace",
    integrityGuard: "Integrity Guard",
    integrityOn: "On",
    integrityStrict: "Strict",
    integrityRelaxed: "Relaxed",
  },
  sidebar: {
    files: "Files",
    chats: "Chats",
    fileTree: "File tree",
    outline: "Outline",
    mainBadge: "Main",
    aiDisclaimer: "AI assists with expression — never invents data or results.",
    uploadFiles: "Upload files",
    uploadFolder: "Upload folder",
    importZip: "Import Overleaf ZIP",
    emptyTree: "No files yet. Import a ZIP or upload files.",
    fileActions: "File actions",
    newChat: "New chat",
    noChats: "No chats yet.",
    defaultChatTitle: "New Chat",
    renameChat: "Rename",
    deleteChat: "Delete",
    deleteChatConfirm: "Delete this chat?",
  },
  assetPreview: {
    download: "Download",
    missing: "Could not load this file.",
  },
  toolbar: {
    share: "Share",
    export: "Export",
    score: "Score",
    defense: "Defense",
    tools: "Tools",
    exportPdf: "Export PDF",
    compileBeforeExport: "Compile before exporting",
  },
  statusBar: {
    saved: "Saved",
    latex: "LaTeX",
    utf8: "UTF-8",
    line: (n) => `Ln ${n}`,
    editor: "Editor",
  },
  pdf: {
    compile: "Compile",
    compiling: "Compiling…",
    noPdfYet: "No PDF yet",
    pagesOf: (current, total) => `${current} of ${total} pages`,
    readOnlyEmptyHint: "PDF preview will appear here when the manuscript finishes compiling.",
    fit: "Fit",
    emptyHint: "Press Compile to generate a PDF preview with PDF.js.",
    compilerAuto: "Auto",
    log: "Log",
    findInPdf: "Find in PDF…",
    search: "Search",
    searching: "Searching…",
    searchNoMatches: "No matches",
    searchMatchOf: (current, total) => `${current} of ${total}`,
    searchPrev: "Previous match",
    searchNext: "Next match",
  },
  tools: {
    projectInfo: "Project Info",
    logicAudit: "Logic Audit",
    citations: "Citations",
    versions: "Versions",
    close: "Close",
    settings: "Settings",
    autoCompile: "Auto-compile PDF",
    autoCompileHint: "Compile when you save (Ctrl+S) or accept an agent suggestion",
    researcherProfile: "Researcher profile",
    researcherProfileHint: "AI defaults, citation style, auto-save, and affiliation",
    open: "Open",
    darkMode: "Dark mode",
    darkModeHint: "Use a darker workspace theme across the app",
    summary: "Summary",
    stats: {
      words: "Words",
      wordsInText: "Words in Text",
      wordsInHeaders: "Words in Headers",
      wordsOutsideText: "Words outside text",
      headers: "Number of headers",
      figures: "Number of figures",
      mathInlines: "Number of math inlines",
      mathDisplayed: "Number of math displayed",
    },
    citationVerification: "Citation Verification",
    verifyCitations: "Verify citations",
    verifying: "Verifying…",
    noTitleInBib: "No title in BibTeX",
    aiRevisionHistory: "AI revision history",
    versionsHelp: "Versions help",
    revisionsHint: "Accept/Reject actions from Ario suggestions are recorded here (L4 audit trail).",
    noRevisions: "No AI revisions yet. Ask Ario to edit or polish your manuscript.",
    revisionAccepted: "Accepted",
    revisionRejected: "Rejected",
    revisionModified: "Modified",
    revisionPending: "Pending",
    charsVsOriginal: "chars vs original",
    noCitationOnFile: "No citation verification on file.",
    noCitationsInManuscript: "No citations found in manuscript.",
    verifiedCitations: (verified, total) => `Verified ${verified}/${total} citations.`,
    citationVerifyError: "Could not verify citations right now. Please try again later.",
  },
  share: {
    circulationDesk: "Circulation desk",
    title: "Share manuscript",
    description:
      "Send a view-only link. Readers see live LaTeX and PDF — no editing, no tools.",
    viewOnly: "View only",
    viewOnlyHint: "Readers cannot edit or run Ario.",
    stableLink: "Stable link",
    stableLinkHint: "Same URL after compile and save until you disable sharing.",
    viewOnlyLink: "View-only link",
    copied: "Copied to clipboard",
    copyLink: "Copy link",
    disableHint: "Disable sharing to revoke access immediately.",
    disableSharing: "Disable sharing",
    bulletPermanent: "One permanent link per project while sharing is on.",
    bulletLive: "Live LaTeX and PDF update for viewers automatically.",
    createLink: "Create view-only link",
    loadError: "Could not load share settings.",
    createError: "Could not create share link.",
    disableError: "Could not disable sharing.",
    copyError: "Could not copy link to clipboard.",
  },
  logicAudit: {
    intro:
      "Comment-only — does not auto-edit the manuscript. Audit modes use a dedicated engine, independent of the chat provider.",
    modeQuick: "Quick (Z.AI GLM-4.7 Flash)",
    modeDeep: "Deep (GLM-4.7)",
    modeQuickSubtitle: "Z.AI · GLM-4.7 Flash",
    modeDeepSubtitle: "Z.AI · GLM-4.7",
    scanFull: "Scan entire manuscript",
    scanFullHintQuick: (count) =>
      `All sections in the manuscript (max 20 parts, currently ${count}).`,
    scanFullHintDeep: (count) =>
      `All sections — deep GLM-4.7 pass (max 8 parts, currently ${count}).`,
    hintQuickSelected:
      "Quick scan of 2–3 sections via GLM-4.7 Flash — ~2–3 min. Independent of chat provider.",
    hintDeepSelected:
      "Deep scan of 1 section via GLM-4.7 — ~3–5 min. Independent of chat provider.",
    hintQuickFull:
      "Full-manuscript scan (max 20 sections) via GLM-4.7 Flash — usually ~5–10 min.",
    hintDeepFull:
      "Full-manuscript deep scan (max 8 sections) via GLM-4.7 — may take 10–20 min.",
    pickOneSection: "Pick 1 section",
    pickSections: "Pick sections to scan",
    selectAll: "Select all",
    imradDefault: "IMRAD default",
    willScanParts: (count) => `Will scan ${count} parts in the LaTeX file.`,
    running: "Running audit…",
    runQuick: "Run Quick audit",
    runDeep: "Run Deep audit",
    runQuickFull: "Run Quick · full manuscript",
    runDeepFull: "Run Deep · full manuscript",
    chatHint: 'Or chat: "/logic" · "/logic full" · "/logic deep".',
    noIssues: "No clear issues found.",
    severityCritical: "CRITICAL",
    severityWarning: "WARNING",
    severityInfo: "SUGGESTION",
    crossSection: "Cross-section:",
    weak: "WEAK",
  },
  llm: {
    paidBadge: "Paid",
    paidChatPlaceholder: "Select a free model to chat…",
    paidChatHint: "Paid models are not available for chat yet.",
  },
  scoreGate: {
    eyebrow: "Pre-publication gate",
    title: "Score manuscript",
    description:
      "Ario evaluates your manuscript before you export PDF — combining AI peer review and technical checks. Score is indicative — final judgement belongs to the author.",
    totalScore: "Total score",
    withAgent: "Combined AI review, structure and citations.",
    heuristicOnly: "Structure, citations and technical checks.",
    compileErrorBanner:
      "LaTeX compile error — fix before publishing to ensure the PDF is accurate.",
    reviewSummary: "Review summary",
    note: "Note",
    staleWarning: "Could not update review:",
    criteria: "Scoring criteria",
    footerLoading:
      "Ario is reading abstract, introduction and conclusion — technical criteria on the right are ready.",
    footerCompileError:
      "PDF is ready to download — but we recommend fixing compile errors first.",
    footerReady: "Export PDF after reviewing the score. See Logic Audit for details.",
    downloadBtn: "Download PDF",
    evaluating: "Evaluating…",
    errorTitle: "Review error",
    dimStructure: "IMRaD Structure",
    dimCompleteness: "Content Completeness",
    dimCitations: "Citations",
    dimLogic: "Argument & Peer Review",
    gradeExcellent: "Excellent",
    gradeGood: "Good",
    gradeFair: "Fair",
    gradeNeedsWork: "Needs improvement",
    gradeFailing: "Failing",
    gradeEvaluating: "Evaluating…",
    hintLoading: "Ario is reading the full manuscript…",
  },
  mobile: {
    files: "Files",
    editor: "Editor",
    preview: "Preview",
  },
};

const VI: EditorCopy = {
  masthead: {
    projects: "Dự án",
    profile: "Hồ sơ",
    latexWorkspace: "Không gian LaTeX",
    integrityGuard: "Integrity Guard",
    integrityOn: "Bật",
    integrityStrict: "Chặt",
    integrityRelaxed: "Nhẹ",
  },
  sidebar: {
    files: "Tệp",
    chats: "Chat",
    fileTree: "Cây tệp",
    outline: "Dàn ý",
    mainBadge: "Chính",
    aiDisclaimer: "AI hỗ trợ diễn đạt — không bịa dữ liệu hay kết quả.",
    uploadFiles: "Tải tệp lên",
    uploadFolder: "Tải thư mục lên",
    importZip: "Nhập ZIP Overleaf",
    emptyTree: "Chưa có tệp. Nhập ZIP Overleaf hoặc tải tệp lên.",
    fileActions: "Thao tác tệp",
    newChat: "Chat mới",
    noChats: "Chưa có cuộc trò chuyện.",
    defaultChatTitle: "Chat mới",
    renameChat: "Đổi tên",
    deleteChat: "Xóa",
    deleteChatConfirm: "Xóa cuộc trò chuyện này?",
  },
  assetPreview: {
    download: "Tải xuống",
    missing: "Không tải được tệp này.",
  },
  toolbar: {
    share: "Chia sẻ",
    export: "Xuất",
    score: "Chấm điểm",
    defense: "Phản biện",
    tools: "Công cụ",
    exportPdf: "Xuất PDF",
    compileBeforeExport: "Biên dịch trước khi xuất",
  },
  statusBar: {
    saved: "Đã lưu",
    latex: "LaTeX",
    utf8: "UTF-8",
    line: (n) => `Dòng ${n}`,
    editor: "Biên tập",
  },
  pdf: {
    compile: "Biên dịch",
    compiling: "Đang biên dịch…",
    noPdfYet: "Chưa có PDF",
    pagesOf: (current, total) => `Trang ${current}/${total}`,
    readOnlyEmptyHint: "Bản xem PDF sẽ hiện ở đây sau khi biên dịch xong bài nghiên cứu.",
    fit: "Vừa khung",
    emptyHint: "Nhấn Biên dịch để tạo bản xem trước PDF với PDF.js.",
    compilerAuto: "Tự động",
    log: "Nhật ký",
    findInPdf: "Tìm trong PDF…",
    search: "Tìm",
    searching: "Đang tìm…",
    searchNoMatches: "Không có kết quả",
    searchMatchOf: (current, total) => `${current}/${total}`,
    searchPrev: "Kết quả trước",
    searchNext: "Kết quả sau",
  },
  tools: {
    projectInfo: "Thông tin dự án",
    logicAudit: "Kiểm tra logic",
    citations: "Trích dẫn",
    versions: "Phiên bản",
    close: "Đóng",
    settings: "Cài đặt",
    autoCompile: "Tự biên dịch PDF",
    autoCompileHint: "Biên dịch khi bạn lưu (Ctrl+S) hoặc chấp nhận gợi ý của agent",
    researcherProfile: "Hồ sơ nhà nghiên cứu",
    researcherProfileHint: "Mặc định AI, kiểu trích dẫn, tự lưu và đơn vị công tác",
    open: "Mở",
    darkMode: "Giao diện tối",
    darkModeHint: "Dùng chủ đề tối hơn trên toàn ứng dụng",
    summary: "Tóm tắt",
    stats: {
      words: "Số từ",
      wordsInText: "Từ trong nội dung",
      wordsInHeaders: "Từ trong tiêu đề",
      wordsOutsideText: "Từ ngoài nội dung",
      headers: "Số tiêu đề",
      figures: "Số hình",
      mathInlines: "Công thức nội dòng",
      mathDisplayed: "Công thức hiển thị",
    },
    citationVerification: "Xác minh trích dẫn",
    verifyCitations: "Xác minh trích dẫn",
    verifying: "Đang xác minh…",
    noTitleInBib: "Không có tiêu đề trong BibTeX",
    aiRevisionHistory: "Lịch sử chỉnh sửa AI",
    versionsHelp: "Trợ giúp phiên bản",
    revisionsHint:
      "Các thao tác Chấp nhận/Từ chối từ gợi ý của Ario được ghi tại đây (nhật ký L4).",
    noRevisions: "Chưa có chỉnh sửa AI. Hãy nhờ Ario chỉnh sửa hoặc polish bản thảo.",
    revisionAccepted: "Đã chấp nhận",
    revisionRejected: "Đã từ chối",
    revisionModified: "Đã sửa",
    revisionPending: "Đang chờ",
    charsVsOriginal: "ký tự so với bản gốc",
    noCitationOnFile: "Chưa có xác minh trích dẫn nào được lưu.",
    noCitationsInManuscript: "Không tìm thấy trích dẫn trong bản thảo.",
    verifiedCitations: (verified, total) => `Đã xác minh ${verified}/${total} trích dẫn.`,
    citationVerifyError: "Không thể xác minh trích dẫn lúc này. Vui lòng thử lại sau.",
  },
  share: {
    circulationDesk: "Bàn phát hành",
    title: "Chia sẻ bản thảo",
    description:
      "Gửi liên kết chỉ xem. Người đọc thấy LaTeX và PDF trực tiếp — không chỉnh sửa, không dùng công cụ.",
    viewOnly: "Chỉ xem",
    viewOnlyHint: "Người đọc không thể chỉnh sửa hay chạy Ario.",
    stableLink: "Liên kết ổn định",
    stableLinkHint: "Cùng URL sau khi biên dịch và lưu cho đến khi bạn tắt chia sẻ.",
    viewOnlyLink: "Liên kết chỉ xem",
    copied: "Đã sao chép",
    copyLink: "Sao chép liên kết",
    disableHint: "Tắt chia sẻ để thu hồi quyền truy cập ngay.",
    disableSharing: "Tắt chia sẻ",
    bulletPermanent: "Một liên kết cố định cho mỗi dự án khi bật chia sẻ.",
    bulletLive: "LaTeX và PDF cập nhật trực tiếp cho người xem.",
    createLink: "Tạo liên kết chỉ xem",
    loadError: "Không tải được cài đặt chia sẻ.",
    createError: "Không tạo được liên kết chia sẻ.",
    disableError: "Không tắt được chia sẻ.",
    copyError: "Không sao chép được liên kết.",
  },
  logicAudit: {
    intro:
      "Chỉ nhận xét — không tự sửa bản thảo. Chế độ audit dùng engine riêng, không phụ thuộc provider trong chat.",
    modeQuick: "Nhanh (Z.AI GLM-4.7 Flash)",
    modeDeep: "Sâu (GLM-4.7)",
    modeQuickSubtitle: "Z.AI · GLM-4.7 Flash",
    modeDeepSubtitle: "Z.AI · GLM-4.7",
    scanFull: "Quét toàn bộ bài",
    scanFullHintQuick: (count) =>
      `Tất cả section trong bản thảo (tối đa 20 phần, hiện có ${count}).`,
    scanFullHintDeep: (count) =>
      `Tất cả section — GLM-4.7 sâu (tối đa 8 phần, hiện có ${count}).`,
    hintQuickSelected:
      "Quét nhanh 2–3 phần bằng GLM-4.7 Flash — ~2–3 phút. Không phụ thuộc provider chat.",
    hintDeepSelected:
      "Soi sâu 1 phần bằng GLM-4.7 — ~3–5 phút. Không phụ thuộc provider chat.",
    hintQuickFull:
      "Quét toàn bộ bài (tối đa 20 phần) bằng GLM-4.7 Flash — thường ~5–10 phút.",
    hintDeepFull:
      "Quét toàn bộ bài (tối đa 8 phần) bằng GLM-4.7 — có thể mất 10–20 phút.",
    pickOneSection: "Chọn 1 phần",
    pickSections: "Chọn phần quét",
    selectAll: "Chọn tất cả",
    imradDefault: "IMRAD mặc định",
    willScanParts: (count) => `Sẽ quét ${count} phần trong file LaTeX.`,
    running: "Đang audit…",
    runQuick: "Chạy Quick audit",
    runDeep: "Chạy Deep audit",
    runQuickFull: "Chạy Quick · toàn bộ bài",
    runDeepFull: "Chạy Deep · toàn bộ bài",
    chatHint: 'Hoặc chat: "/logic" · "/logic full" · "/logic deep".',
    noIssues: "Không có vấn đề rõ ràng.",
    severityCritical: "NGHIÊM TRỌNG",
    severityWarning: "CẢNH BÁO",
    severityInfo: "GỢI Ý",
    crossSection: "Liên section:",
    weak: "YẾU",
  },
  llm: {
    paidBadge: "Trả phí",
    paidChatPlaceholder: "Chọn model miễn phí để chat…",
    paidChatHint: "Model trả phí chưa hỗ trợ chat.",
  },
  scoreGate: {
    eyebrow: "Pre-publication gate",
    title: "Chấm điểm bài báo",
    description:
      "Ario đánh giá bản thảo trước khi bạn xuất PDF — kết hợp phản biện AI và kiểm tra kỹ thuật. Điểm số mang tính gợi ý — quyết định cuối thuộc về tác giả.",
    totalScore: "Điểm tổng",
    withAgent: "Kết hợp phản biện AI, cấu trúc và trích dẫn.",
    heuristicOnly: "Cấu trúc, trích dẫn và kỹ thuật.",
    compileErrorBanner:
      "LaTeX compile lỗi — sửa lỗi trước khi xuất bản để đảm bảo PDF chính xác.",
    reviewSummary: "Tóm tắt phản biện",
    note: "Lưu ý",
    staleWarning: "Không cập nhật phản biện mới:",
    criteria: "Tiêu chí chấm điểm",
    footerLoading:
      "Ario đang đọc abstract, giới thiệu và kết luận — tiêu chí kỹ thuật bên phải sẵn sàng.",
    footerCompileError:
      "PDF đã sẵn sàng tải — nhưng khuyến nghị sửa lỗi compile trước.",
    footerReady: "Xuất PDF sau khi xem điểm. Chi tiết logic xem trong Logic Audit.",
    downloadBtn: "Tải PDF",
    evaluating: "Đang đánh giá…",
    errorTitle: "Lỗi phản biện",
    dimStructure: "Cấu trúc IMRaD",
    dimCompleteness: "Độ đầy đủ nội dung",
    dimCitations: "Trích dẫn",
    dimLogic: "Mạch lập luận & phản biện",
    gradeExcellent: "Xuất sắc",
    gradeGood: "Tốt",
    gradeFair: "Khá",
    gradeNeedsWork: "Cần cải thiện",
    gradeFailing: "Chưa đạt",
    gradeEvaluating: "Đang đánh giá…",
    hintLoading: "Ario đang đọc lướt toàn bộ bài…",
  },
  mobile: {
    files: "Tệp",
    editor: "Soạn thảo",
    preview: "Xem trước",
  },
};

export function editorCopy(lang: UiLanguage): EditorCopy {
  return lang === "vi" ? VI : EN;
}

export function formatMastheadDate(locale: UiLanguage): string {
  return new Date().toLocaleDateString(localeBcp47(locale), {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function logicAuditModeHint(
  locale: UiLanguage,
  mode: LogicAuditMode,
  scope: LogicAuditScope = "selected",
): string {
  const t = editorCopy(locale).logicAudit;
  if (scope === "full") {
    return mode === "deep" ? t.hintDeepFull : t.hintQuickFull;
  }
  return mode === "deep" ? t.hintDeepSelected : t.hintQuickSelected;
}

export function revisionActionLabel(locale: UiLanguage, action: string): string {
  const t = editorCopy(locale).tools;
  switch (action.toLowerCase()) {
    case "accepted":
      return t.revisionAccepted;
    case "rejected":
      return t.revisionRejected;
    case "modified":
      return t.revisionModified;
    default:
      return t.revisionPending;
  }
}

/** Map known English citation summaries from the API to the active locale. */
export function translateCitationSummary(locale: UiLanguage, summary: string): string {
  if (!summary) return "";
  const t = editorCopy(locale).tools;
  if (summary === "No citation verification on file.") return t.noCitationOnFile;
  if (summary === "No citations found in manuscript.") return t.noCitationsInManuscript;
  const verifiedMatch = summary.match(/^Verified (\d+)\/(\d+) citations\.$/);
  if (verifiedMatch) {
    return t.verifiedCitations(Number(verifiedMatch[1]), Number(verifiedMatch[2]));
  }
  return summary;
}
