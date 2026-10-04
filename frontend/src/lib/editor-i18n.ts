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
    engineUnavailable: string;
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
    structure: string;
    structureIntro: string;
    structureEmpty: string;
    structureJump: string;
    structureAskArio: string;
    structureApplyFix: string;
    structureUnknownSection: string;
    citationAskArio: string;
    citationFixAll: string;
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
    staleReport: string;
    partialReport: string;
    cancel: string;
    auditingInProgress: string;
    jumpToIssue: string;
    askArio: string;
    claimLabel: string;
    partialChatStopped: (count: number) => string;
    partialChatTimeout: (count: number) => string;
    scanQuick: string;
    scanQuickSubtitle: string;
    scanFull: string;
    scanFullSubtitle: (count: number) => string;
    hintQuickSelected: string;
    hintQuickFull: string;
    pickSections: string;
    selectAll: string;
    imradDefault: string;
    willScanParts: (count: number) => string;
    running: string;
    runQuick: string;
    runQuickFull: string;
    panelNote: string;
    sectionsSkipped: (count: number) => string;
    noIssues: string;
    severityCritical: string;
    severityWarning: string;
    severityInfo: string;
    crossSection: string;
    weak: string;
    engineUnavailable: string;
    sectionProgress: (completed: number, total: number) => string;
    panelLaunch: {
      displayQuick: string;
      displayQuickFull: string;
      messageFull: string;
      messageQuickSelected: string;
    };
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
    gatePeerReviewNote: string;
    retryAudit: string;
    topIssues: string;
    templateBanner: string;
    jumpToSection: string;
    openCitations: string;
    auditAnimationLabel: string;
    auditPhrases: string[];
  };
  mobile: {
    files: string;
    editor: string;
    preview: string;
    tools: string;
    chats: string;
  };
  selectionToolbar: {
    ariaLabel: string;
    line: (line: number) => string;
    lineRange: (start: number, end: number) => string;
    askSelection: string;
    askSelectionTitle: string;
    editSelection: string;
    editSelectionTitle: string;
    dismiss: string;
  };
  chatDock: {
    openChat: string;
    quickEditBanner: string;
    selectionLine: (line: number) => string;
    selectionLineRange: (start: number, end: number) => string;
    clearSelection: string;
    placeholderNoProvider: string;
    placeholderQuickEdit: string;
    placeholderSelection: string;
    placeholderDefault: string;
    hintEditScope: string;
    hintPendingEdits: string;
    llmHint: string;
    closeChat: string;
    collapseChat: string;
    resizeChat: string;
    emptySlashHint: (hints: string) => string;
    reasoningTitle: string;
    expandChat: string;
    stopProcessing: string;
    copyMessage: string;
    sendMessage: string;
  };
  suggestion: {
    documentMode: string;
    selectionMode: string;
    shortcutHint: string;
    reject: string;
    accept: string;
  };
  pendingEdits: {
    title: (count: number) => string;
    hint: string;
    rejectAll: string;
    acceptAll: string;
    reject: string;
    accept: string;
    proposedChange: string;
    integrityBlocked: string;
    staleWarning: string;
    staleBadge: string;
    staleOnAccept: string;
  };
  welcome: {
    assistantMessage: string;
  };
  chatStream: {
    processing: string;
    stopped: string;
    timeout: string;
    acceptApplied: string;
    acceptAppliedCompile: string;
    compileAfterEditOk: string;
    compileAfterEditFail: string;
    rejectSuggestionHint: string;
    rejectScopeDocument: string;
    rejectScopeStyle: string;
    rejectScopeAllEdits: string;
    resyncFailed: string;
  };
  errors: {
    saveFailed: string;
    syncFailed: string;
    revisionFailed: string;
    chatPersistFailed: string;
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
    engineUnavailable:
      "The LaTeX compiler is not available on the server right now. Please try again later.",
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
    revisionsHint:
      "Accept/Reject actions from Ario suggestions are recorded here (L4 audit trail).",
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
    structure: "Structure",
    structureIntro: "IMRAD outline suggestions from Ario. Jump to a section or ask Ario to fix it.",
    structureEmpty:
      "No structure suggestions yet. Run /structure in chat to analyze the manuscript.",
    structureJump: "Jump in editor",
    structureAskArio: "Ask Ario",
    structureApplyFix: "Apply fix",
    structureUnknownSection: "Manuscript",
    citationAskArio: "Ask Ario",
    citationFixAll: "Fix unverified citations",
  },
  share: {
    circulationDesk: "Circulation desk",
    title: "Share manuscript",
    description: "Send a view-only link. Readers see live LaTeX and PDF — no editing, no tools.",
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
    staleReport: "Manuscript changed since this audit — run again for up-to-date results.",
    partialReport:
      "Partial audit — stopped early (timeout or cancel). Re-run for remaining sections.",
    cancel: "Cancel audit",
    auditingInProgress: "New audit running — previous results stay visible until sections update.",
    jumpToIssue: "Go to line",
    askArio: "Ask Ario",
    claimLabel: "Claim:",
    partialChatStopped: (count) =>
      `Logic audit stopped — **${count}** section(s) already scanned. See **Logic Audit** tab for details.`,
    partialChatTimeout: (count) =>
      `Logic audit timed out — **${count}** section(s) scanned. See **Logic Audit** tab; try fewer sections or Quick mode.`,
    scanQuick: "Quick scan",
    scanQuickSubtitle: "/logic · 2–3 IMRAD sections · Gemini 2.5 Flash · ~1–2 min",
    scanFull: "Full manuscript",
    scanFullSubtitle: (count) =>
      `/logic full · up to 20 sections · Gemini 3.5 Flash · ${count} parts in file`,
    hintQuickSelected:
      "Quick scan of 2–3 sections via Gemini 2.5 Flash — ~1–2 min. Independent of chat provider.",
    hintQuickFull:
      "Full-manuscript scan (max 20 sections) via Gemini 3.5 Flash — usually ~3–8 min.",
    pickSections: "Pick sections to scan",
    selectAll: "Select all",
    imradDefault: "IMRAD default",
    willScanParts: (count) => `Will scan ${count} parts in the LaTeX file.`,
    running: "Running audit…",
    runQuick: "Run Quick audit",
    runQuickFull: "Run full-manuscript audit",
    panelNote: "Uses a dedicated Gemini engine (GOOGLE_API_KEY) — independent of chat provider.",
    sectionsSkipped: (count) =>
      `${count} section(s) could not be scanned (API timeout or empty persona response).`,
    noIssues: "No clear issues found.",
    severityCritical: "CRITICAL",
    severityWarning: "WARNING",
    severityInfo: "SUGGESTION",
    crossSection: "Cross-section:",
    weak: "WEAK",
    engineUnavailable:
      "Logic audit needs Google (Gemini) configured on the server — add GOOGLE_API_KEY in Settings.",
    sectionProgress: (completed, total) => `Sections scanned: ${completed}/${total}`,
    panelLaunch: {
      displayQuick: "Logic audit · Quick",
      displayQuickFull: "Logic audit · full manuscript",
      messageFull: "Run a logic audit on the full manuscript",
      messageQuickSelected: "Quick logic audit on the manuscript",
    },
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
      "Ario is reading abstract, introduction, methods, results and conclusion — technical criteria on the right are ready.",
    footerCompileError: "PDF is ready to download — but we recommend fixing compile errors first.",
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
    gatePeerReviewNote:
      "Quick skim for scoring only — open the Logic Audit tab for full multi-agent review.",
    retryAudit: "Retry AI review",
    topIssues: "Key issues",
    templateBanner:
      "This looks like a template or placeholder — replace sample text with real research before relying on the score.",
    jumpToSection: "Go to section",
    openCitations: "Open Citations in Tools",
    auditAnimationLabel: "Ario is reading",
    auditPhrases: [
      "Reading abstract…",
      "Analyzing main arguments…",
      "Checking logical flow…",
      "Cross-checking intro and conclusion…",
      "Finding weak claims…",
      "Verifying consistency…",
      "Assessing academic quality…",
      "Summarizing feedback…",
    ],
  },
  mobile: {
    files: "Files",
    editor: "Editor",
    preview: "Preview",
    tools: "Tools",
    chats: "Chats",
  },
  selectionToolbar: {
    ariaLabel: "Selection actions",
    line: (line) => `L${line}`,
    lineRange: (start, end) => `L${start}–${end}`,
    askSelection: "Ask",
    askSelectionTitle: "Ask about this passage (explain, review, chat)",
    editSelection: "Edit",
    editSelectionTitle: "Edit this passage in the manuscript",
    dismiss: "Dismiss",
  },
  chatDock: {
    openChat: "Open chat",
    quickEditBanner: "Edit mode — changes apply only to the highlighted passage",
    selectionLine: (line) => `Line ${line}`,
    selectionLineRange: (start, end) => `Lines ${start}–${end}`,
    clearSelection: "Clear selection",
    placeholderNoProvider: "Configure an API key to use chat",
    placeholderQuickEdit: "How should this passage be edited?",
    placeholderSelection: "Ask or explain this passage…",
    placeholderDefault: "Ask Ario… or type / for commands",
    hintEditScope: "Tip: select text or say e.g. «edit Abstract» for precise edits.",
    hintPendingEdits: "You have pending diffs — Accept/Reject above, or ask for changes.",
    llmHint: "No LLM provider — add OPENROUTER_API_KEY or ZAI_API_KEY to .env",
    closeChat: "Close chat",
    collapseChat: "Collapse chat",
    resizeChat: "Drag to resize chat",
    emptySlashHint: (hints) => `Pick a provider and model below. Quick commands: ${hints}.`,
    reasoningTitle: "Reasoning",
    expandChat: "Expand chat",
    stopProcessing: "Stop processing",
    copyMessage: "Copy message",
    sendMessage: "Send message",
  },
  suggestion: {
    documentMode: "Ario suggests a change — inline in the editor (red = remove, green = add)",
    selectionMode: "Ario suggests an edit — inline in the editor (red = remove, green = add)",
    shortcutHint: "Ctrl+Enter Accept · Esc Reject",
    reject: "Reject",
    accept: "Accept",
  },
  pendingEdits: {
    title: (count) => `Changes from Ario (${count})`,
    hint: "Click to preview · Ctrl+Enter Accept · Esc Reject",
    rejectAll: "Reject all",
    acceptAll: "Accept all",
    reject: "Reject",
    accept: "Accept",
    proposedChange: "Proposed change",
    integrityBlocked:
      "Serious integrity flags — review the diff and Reject or revise before Accept.",
    staleWarning: "The file changed since this suggestion was created.",
    staleBadge: "Out of date",
    staleOnAccept: "This edit is out of date — reject it and ask Ario again.",
  },
  welcome: {
    assistantMessage:
      "Hi — I'm Ario, your research assistant in Paper IDE ARIONEAR. You can assign tasks freely: rename title/author, rewrite the Abstract, polish academic tone, check IMRAD structure, or ask about LaTeX. Pick a provider/model below and describe what you need.",
  },
  chatStream: {
    processing: "Processing",
    stopped: "Stopped.",
    timeout: "AI task timed out — try a shorter scope or a faster model.",
    acceptApplied: "Applied to the draft. Press Ctrl+S to save.",
    acceptAppliedCompile: "Applied to the draft. Compiling PDF…",
    compileAfterEditOk: "PDF updated — compile succeeded.",
    compileAfterEditFail: "Edit applied but PDF compile failed — use «Ask Ario to fix».",
    rejectSuggestionHint:
      "Suggestion rejected. A follow-up prompt is in the chat box — refine your request and send again.",
    rejectScopeDocument: "entire manuscript",
    rejectScopeStyle: "style edit",
    rejectScopeAllEdits: "pending edits",
    resyncFailed: "Could not sync manuscript with the server — reload the project and try again.",
  },
  errors: {
    saveFailed: "Could not save the project — check your connection and try again.",
    syncFailed: "Could not sync the AI session — your draft is saved locally.",
    revisionFailed: "Could not update revision history.",
    chatPersistFailed: "Could not save chat history.",
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
    engineUnavailable:
      "Trình biên dịch LaTeX trên server hiện chưa sẵn sàng. Vui lòng thử lại sau.",
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
    structure: "Cấu trúc",
    structureIntro: "Gợi ý cấu trúc IMRAD từ Ario. Nhảy tới section hoặc nhờ Ario chỉnh trực tiếp.",
    structureEmpty: "Chưa có gợi ý cấu trúc. Chạy /structure trong chat để phân tích bản thảo.",
    structureJump: "Xem trong editor",
    structureAskArio: "Nhờ Ario sửa",
    structureApplyFix: "Sửa ngay",
    structureUnknownSection: "Bản thảo",
    citationAskArio: "Nhờ Ario sửa",
    citationFixAll: "Sửa trích dẫn chưa xác minh",
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
    staleReport: "Bản thảo đã thay đổi sau lần audit này — chạy lại để có kết quả mới nhất.",
    partialReport:
      "Audit chưa hoàn tất — dừng sớm (timeout hoặc hủy). Chạy lại để quét phần còn lại.",
    cancel: "Hủy audit",
    auditingInProgress: "Đang audit mới — kết quả cũ vẫn hiển thị cho đến khi có section cập nhật.",
    jumpToIssue: "Tới dòng",
    askArio: "Nhờ Ario",
    claimLabel: "Khẳng định:",
    partialChatStopped: (count) =>
      `Logic audit đã dừng — **${count}** phần đã quét. Xem tab **Logic Audit** để biết chi tiết.`,
    partialChatTimeout: (count) =>
      `Logic audit timeout — **${count}** phần đã quét. Xem tab **Logic Audit**; thử ít section hơn hoặc chế độ Nhanh.`,
    scanQuick: "Quét nhanh",
    scanQuickSubtitle: "/logic · 2–3 phần IMRAD · Gemini 2.5 Flash · ~1–2 phút",
    scanFull: "Toàn bộ bài",
    scanFullSubtitle: (count) =>
      `/logic full · tối đa 20 section · Gemini 3.5 Flash · ${count} phần trong file`,
    hintQuickSelected:
      "Quét nhanh 2–3 phần bằng Gemini 2.5 Flash — ~1–2 phút. Không phụ thuộc provider chat.",
    hintQuickFull: "Quét toàn bộ bài (tối đa 20 phần) bằng Gemini 3.5 Flash — thường ~3–8 phút.",
    pickSections: "Chọn phần quét",
    selectAll: "Chọn tất cả",
    imradDefault: "IMRAD mặc định",
    willScanParts: (count) => `Sẽ quét ${count} phần trong file LaTeX.`,
    running: "Đang audit…",
    runQuick: "Chạy Quick audit",
    runQuickFull: "Chạy quét toàn bộ bài",
    panelNote: "Dùng engine Gemini riêng (GOOGLE_API_KEY) — không phụ thuộc provider chat.",
    sectionsSkipped: (count) =>
      `${count} phần không quét được (timeout API hoặc persona không phản hồi).`,
    noIssues: "Không có vấn đề rõ ràng.",
    severityCritical: "NGHIÊM TRỌNG",
    severityWarning: "CẢNH BÁO",
    severityInfo: "GỢI Ý",
    crossSection: "Liên section:",
    weak: "YẾU",
    engineUnavailable:
      "Logic audit cần Google (Gemini) trên server — thêm GOOGLE_API_KEY trong Cài đặt.",
    sectionProgress: (completed, total) => `Đã quét: ${completed}/${total} phần`,
    panelLaunch: {
      displayQuick: "Logic audit · Quick",
      displayQuickFull: "Logic audit · toàn bộ bài",
      messageFull: "Kiểm tra logic toàn bộ bài báo",
      messageQuickSelected: "Kiểm tra logic bài báo",
    },
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
    compileErrorBanner: "LaTeX compile lỗi — sửa lỗi trước khi xuất bản để đảm bảo PDF chính xác.",
    reviewSummary: "Tóm tắt phản biện",
    note: "Lưu ý",
    staleWarning: "Không cập nhật phản biện mới:",
    criteria: "Tiêu chí chấm điểm",
    footerLoading:
      "Ario đang đọc abstract, giới thiệu, phương pháp, kết quả và kết luận — tiêu chí kỹ thuật bên phải sẵn sàng.",
    footerCompileError: "PDF đã sẵn sàng tải — nhưng khuyến nghị sửa lỗi compile trước.",
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
    gatePeerReviewNote: "Phản biện nhanh cho chấm điểm — mở tab Logic Audit để soi sâu đa persona.",
    retryAudit: "Chạy lại phản biện AI",
    topIssues: "Vấn đề nổi bật",
    templateBanner:
      "Bản thảo có vẻ là template/mẫu — thay nội dung mẫu bằng nghiên cứu thật trước khi tin vào điểm số.",
    jumpToSection: "Đi tới section",
    openCitations: "Mở Citations trong Tools",
    auditAnimationLabel: "Ario đang đọc",
    auditPhrases: [
      "Đọc abstract…",
      "Phân tích luận điểm chính…",
      "Kiểm tra mạch lập luận…",
      "Đối chiếu giới thiệu và kết luận…",
      "Tìm điểm yếu trong lập luận…",
      "Xác minh tính nhất quán…",
      "Đánh giá chất lượng học thuật…",
      "Tổng hợp nhận xét…",
    ],
  },
  mobile: {
    files: "Tệp",
    editor: "Soạn thảo",
    preview: "Xem trước",
    tools: "Công cụ",
    chats: "Hội thoại",
  },
  selectionToolbar: {
    ariaLabel: "Thao tác vùng chọn",
    line: (line) => `D${line}`,
    lineRange: (start, end) => `D${start}–${end}`,
    askSelection: "Hỏi",
    askSelectionTitle: "Hỏi về đoạn này (giải thích, nhận xét, trò chuyện)",
    editSelection: "Sửa",
    editSelectionTitle: "Sửa đoạn này trong bài viết",
    dismiss: "Đóng",
  },
  chatDock: {
    openChat: "Mở chat",
    quickEditBanner: "Chế độ sửa — chỉ thay đổi vùng đã bôi đen",
    selectionLine: (line) => `Dòng ${line}`,
    selectionLineRange: (start, end) => `Dòng ${start}–${end}`,
    clearSelection: "Bỏ vùng chọn",
    placeholderNoProvider: "Cấu hình API key để dùng chat",
    placeholderQuickEdit: "Bạn muốn sửa đoạn này thế nào?",
    placeholderSelection: "Hỏi hoặc giải thích đoạn này…",
    placeholderDefault: "Hỏi Ario… hoặc gõ / để chọn lệnh",
    hintEditScope: "Gợi ý: bôi đen đoạn hoặc nói rõ «sửa Abstract» để chỉnh đúng phần.",
    hintPendingEdits: "Còn diff chờ duyệt — Accept/Reject ở trên, hoặc nhắn chỉnh tiếp.",
    llmHint: "Chưa có provider LLM — thêm OPENROUTER_API_KEY hoặc ZAI_API_KEY vào .env",
    closeChat: "Đóng chat",
    collapseChat: "Thu gọn chat",
    resizeChat: "Kéo để đổi chiều cao chat",
    emptySlashHint: (hints) => `Chọn provider và model phía dưới. Gõ lệnh nhanh: ${hints}.`,
    reasoningTitle: "Suy luận",
    expandChat: "Mở rộng chat",
    stopProcessing: "Dừng xử lý",
    copyMessage: "Sao chép tin nhắn",
    sendMessage: "Gửi tin nhắn",
  },
  suggestion: {
    documentMode: "Ario đề xuất thay đổi — inline trong editor (đỏ = xóa, xanh = thêm)",
    selectionMode: "Ario đề xuất chỉnh sửa — inline trong editor (đỏ = xóa, xanh = thêm)",
    shortcutHint: "Ctrl+Enter Accept · Esc Reject",
    reject: "Từ chối",
    accept: "Chấp nhận",
  },
  pendingEdits: {
    title: (count) => `Các thay đổi từ Ario (${count})`,
    hint: "Click để preview · Ctrl+Enter Accept · Esc Reject",
    rejectAll: "Từ chối tất cả",
    acceptAll: "Chấp nhận tất cả",
    reject: "Từ chối",
    accept: "Chấp nhận",
    proposedChange: "Đề xuất thay đổi",
    integrityBlocked:
      "Có cảnh báo integrity nghiêm trọng — xem diff và Reject hoặc chỉnh lại trước khi Accept.",
    staleWarning: "File đã thay đổi kể từ khi tạo đề xuất này.",
    staleBadge: "Đã lỗi thời",
    staleOnAccept: "Đề xuất đã lỗi thời — hãy Reject và nhờ Ario tạo lại.",
  },
  welcome: {
    assistantMessage:
      "Xin chào — tôi là Ario, trợ lý NCKH trong Paper IDE ARIONEAR. Bạn có thể giao task tự do: sửa tên/tác giả, viết lại Abstract, chỉnh văn phong học thuật, kiểm tra cấu trúc IMRAD, hoặc hỏi về LaTeX. Chọn provider/model bên dưới rồi mô tả việc cần làm.",
  },
  chatStream: {
    processing: "Đang xử lý",
    stopped: "Đã dừng xử lý.",
    timeout: "Tác vụ AI quá thời gian — thử lại với đoạn ngắn hơn hoặc đổi model.",
    acceptApplied: "Đã áp dụng thay đổi vào bản thảo. Nhấn Ctrl+S để lưu file.",
    acceptAppliedCompile: "Đã áp dụng thay đổi vào bản thảo. Đang compile PDF…",
    compileAfterEditOk: "PDF đã cập nhật — compile thành công.",
    compileAfterEditFail: "Đã áp dụng sửa nhưng compile lỗi — dùng «Nhờ Ario sửa».",
    rejectSuggestionHint:
      "Đã từ chối gợi ý. Mình đã gợi ý câu lệnh trong ô chat — bổ sung yêu cầu rồi gửi lại nhé.",
    rejectScopeDocument: "toàn bộ bản thảo",
    rejectScopeStyle: "biên tập văn phong",
    rejectScopeAllEdits: "các gợi ý chỉnh sửa",
    resyncFailed: "Không đồng bộ được bản thảo với server — tải lại dự án và thử lại.",
  },
  errors: {
    saveFailed: "Không lưu được dự án — kiểm tra kết nối và thử lại.",
    syncFailed: "Không đồng bộ được phiên AI — bản thảo vẫn được lưu cục bộ.",
    revisionFailed: "Không cập nhật được lịch sử phiên bản.",
    chatPersistFailed: "Không lưu được lịch sử chat.",
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
  scope: LogicAuditScope = "selected",
): string {
  const t = editorCopy(locale).logicAudit;
  return scope === "full" ? t.hintQuickFull : t.hintQuickSelected;
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
