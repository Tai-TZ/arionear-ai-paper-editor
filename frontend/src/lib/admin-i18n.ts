import type { UiLanguage } from "@/lib/researcher-profile";

export type AdminCopy = {
  consoleEyebrow: string;
  platformControl: string;
  signOut: string;
  godAdmin: string;
  platformOperator: string;
  loading: string;
  retry: string;
  cancel: string;
  confirm: string;
  saveDefaults: string;
  unsavedDefaults: string;
  protectedAccount: string;
  loadError: string;
  costLoadError: string;
  updateFailed: string;
  defaultsSaved: string;
  saveFailed: string;
  roleResearcher: string;
  roleAdmin: string;
  tabs: {
    overview: string;
    users: string;
    cost: string;
    llm: string;
    llmKeys: string;
    templates: string;
  };
  overview: {
    noSessionsTitle: string;
    noSessionsHint: string;
    totalUsers: string;
    totalUsersHint: (active: number, admins: number) => string;
    tokensToday: string;
    tokensTodayHint: (total: number, sessions: number) => string;
    monthCost: string;
    monthCostHint: (total: string) => string;
    quotaWarnings: string;
    quotaWarningsHint: (overDaily: number, overMonthly: number) => string;
    newUsersTitle: string;
    newUsersRecent: string;
    newUsers7d: string;
    newUsers30d: string;
    recentUsersTitle: string;
    noRecentUsers: string;
    colUser: string;
    colProvider: string;
    colRole: string;
    colJoined: string;
    colLastActive: string;
    llmStackTitle: string;
    defaultProvider: string;
    defaultModel: string;
    temperature: string;
    integrity: string;
    providersTitle: string;
    configured: string;
    notConfigured: string;
    modelsAvailable: string;
    defaultBadge: string;
  };
  users: {
    intro: string;
    searchPlaceholder: string;
    searchAria: string;
    count: (shown: number, total: number) => string;
    emptyTitle: string;
    emptyHint: string;
    colResearcher: string;
    colRole: string;
    colToday: string;
    colMonth: string;
    colStatus: string;
    colActions: string;
    dailyCap: (cap: string) => string;
    monthlyCap: (cap: string) => string;
    overDaily: string;
    overMonthly: string;
    active: string;
    inactive: string;
    limits: string;
    promote: string;
    demote: string;
    disable: string;
    enable: string;
    confirmDisable: (name: string) => string;
    confirmEnable: (name: string) => string;
    confirmDemote: (name: string) => string;
    confirmPromote: (name: string) => string;
    toastEnabled: string;
    toastDisabled: string;
    toastRole: (role: string) => string;
    limitsSaved: string;
    lastActive: string;
    joined: string;
    editLimits: string;
    dailyTokenMax: string;
    monthlyCostCap: string;
    rateLimit: string;
    llmEnabled: string;
    saveLimits: string;
  };
  cost: {
    intro: string;
    reportMonth: string;
    hideUnused: string;
    loading: string;
    emptyTitle: string;
    emptyHintFiltered: string;
    emptyHintNoUsage: string;
    totalCost: string;
    totalTokens: string;
    activeUsers: string;
    rateLabel: string;
    colResearcher: string;
    colSessions: string;
    colTokens: string;
    colCost: string;
    colMonthlyCap: string;
    colPctCap: string;
    usersWithUsage: (n: number) => string;
    monthSelectAria: string;
    pickMonth: string;
  };
  llm: {
    intro: string;
    providerStatusTitle: string;
    configured: string;
    missingKey: string;
    globalDefaultsTitle: string;
    dailyTokenMax: string;
    monthlyCostCap: string;
    rateLimit: string;
    costPer1k: string;
    minTemperature: string;
    maxTemperature: string;
    defaultTemperature: string;
    serverEnvFoot: (provider: string, retries: number) => string;
  };
  llmKeys: {
    intro: string;
    loading: string;
    loadError: string;
    summary: (configured: number, total: number) => string;
    configured: string;
    missingKey: string;
    envFallbackHint: string;
    noAdminKeys: string;
    supportedModels: string;
    modelsCount: (n: number) => string;
    newKey: string;
    newKeyPlaceholder: string;
    priority: string;
    priorityHint: string;
    labelOptional: string;
    labelPlaceholder: string;
    saveKey: string;
    saved: string;
    saveError: string;
    keyRequired: string;
    test: string;
    testDraft: string;
    testActive: string;
    testModel: string;
    testOk: (ms: number) => string;
    testFail: string;
    testError: string;
    testSavedHint: string;
    saveBeforeChat: string;
    deleted: string;
    deleteError: string;
    cleared: string;
    clearError: string;
    clearAdminKeys: string;
    inactive: string;
    lastVerified: string;
    googleTestHint: string;
  };
  templates: {
    intro: string;
    addTemplate: string;
    count: (n: number) => string;
    loading: string;
    emptyTitle: string;
    emptyHint: string;
    colTemplate: string;
    colAssets: string;
    colMeta: string;
    colActions: string;
    preview: string;
    pdf: string;
    hasAsset: string;
    missingAsset: string;
    edit: string;
    uploadPreview: string;
    uploadPdf: string;
    delete: string;
    official: string;
    journal: string;
    conference: string;
    addDialogTitle: string;
    editDialogTitle: string;
    dialogHint: string;
    templateId: string;
    format: string;
    title: string;
    titleVi: string;
    description: string;
    abstract: string;
    author: string;
    venue: string;
    tags: string;
    officialTemplate: string;
    latexSource: string;
    createTemplate: string;
    saveChanges: string;
    loadingTemplate: string;
    confirmDelete: (id: string) => string;
    toastCreated: string;
    toastSaved: string;
    toastDeleted: string;
    toastPreviewUploaded: string;
    toastPdfUploaded: string;
    errLoad: string;
    errLoadTemplate: string;
    errSave: string;
    errDelete: string;
    errUpload: string;
    errIdRequired: string;
    errTitleRequired: string;
    errLatexRequired: string;
  };
};

const EN: AdminCopy = {
  consoleEyebrow: "Admin Console",
  platformControl: "Platform Control",
  signOut: "Sign out",
  godAdmin: "God Admin",
  platformOperator: "Platform operator",
  loading: "Loading admin console…",
  retry: "Retry",
  cancel: "Cancel",
  confirm: "Confirm",
  saveDefaults: "Save defaults",
  unsavedDefaults: "Unsaved defaults",
  protectedAccount: "Protected",
  loadError: "Could not load admin data.",
  costLoadError: "Could not load cost report.",
  updateFailed: "Update failed",
  defaultsSaved: "Global LLM defaults saved",
  saveFailed: "Save failed",
  roleResearcher: "Researcher",
  roleAdmin: "Admin",
  tabs: {
    overview: "Overview",
    users: "Users & Quotas",
    cost: "Cost Report",
    llm: "LLM Policy",
    llmKeys: "API Keys",
    templates: "Templates",
  },
  overview: {
    noSessionsTitle: "No AI sessions yet",
    noSessionsHint: "Usage and cost appear after researchers use chat in the editor.",
    totalUsers: "Total users",
    totalUsersHint: (active, admins) => `${active} active · ${admins} admins`,
    tokensToday: "Tokens today",
    tokensTodayHint: (total, sessions) =>
      `All-time: ${total.toLocaleString()} tok · ${sessions.toLocaleString()} sessions`,
    monthCost: "Cost this month",
    monthCostHint: (total) => `All-time: ${total}`,
    quotaWarnings: "Quota warnings",
    quotaWarningsHint: (overDaily, overMonthly) =>
      `${overDaily} over daily token · ${overMonthly} over monthly cost`,
    newUsersTitle: "New users",
    newUsersRecent: "Recent",
    newUsers7d: "Last 7 days",
    newUsers30d: "Last 30 days",
    recentUsersTitle: "Recently joined",
    noRecentUsers: "No users yet",
    colUser: "User",
    colProvider: "Auth",
    colRole: "Role",
    colJoined: "Joined",
    colLastActive: "Last active",
    llmStackTitle: "Platform LLM defaults",
    defaultProvider: "Default provider",
    defaultModel: "Default model",
    temperature: "Temperature",
    integrity: "Integrity",
    providersTitle: "Available providers & models",
    configured: "API key set",
    notConfigured: "Not configured",
    modelsAvailable: "Models",
    defaultBadge: "default",
  },
  users: {
    intro:
      "Manage researcher accounts, roles, and LLM quotas. Today = tokens used today vs daily cap; This month = current month cost vs monthly cap — matches live chat enforcement.",
    searchPlaceholder: "Search by name, email, or role…",
    searchAria: "Search users",
    count: (shown, total) => `${shown} of ${total} users`,
    emptyTitle: "No users found",
    emptyHint: "Try a different name or email.",
    colResearcher: "Researcher",
    colRole: "Role",
    colToday: "Today / Daily cap",
    colMonth: "This month / Monthly cap",
    colStatus: "Status",
    colActions: "Actions",
    dailyCap: (cap) => `cap: ${cap} / day`,
    monthlyCap: (cap) => `cap: ${cap} / month`,
    overDaily: "Over daily cap",
    overMonthly: "Over monthly cap",
    active: "Active",
    inactive: "Inactive",
    limits: "Limits",
    promote: "Promote",
    demote: "Demote",
    disable: "Disable",
    enable: "Enable",
    confirmDisable: (name) => `Disable account "${name}"?`,
    confirmEnable: (name) => `Re-enable "${name}"?`,
    confirmDemote: (name) => `Demote "${name}" to RESEARCHER?`,
    confirmPromote: (name) => `Promote "${name}" to ADMIN?`,
    toastEnabled: "Account enabled",
    toastDisabled: "Account disabled",
    toastRole: (role) => `Role updated to ${role}`,
    limitsSaved: "LLM limits saved",
    lastActive: "Last active",
    joined: "Joined",
    editLimits: "Edit LLM limits",
    dailyTokenMax: "Daily token max",
    monthlyCostCap: "Monthly cost cap (USD)",
    rateLimit: "Rate limit / min",
    llmEnabled: "LLM enabled",
    saveLimits: "Save limits",
  },
  cost: {
    intro:
      "Estimated monthly LLM spend. Cost = tokens × rate per 1k tokens (configured in LLM Policy).",
    reportMonth: "Report month",
    hideUnused: "Hide users with no usage",
    loading: "Loading cost report…",
    emptyTitle: "No usage this month",
    emptyHintFiltered: "Turn off “Hide users with no usage” to see the full list.",
    emptyHintNoUsage: "Researchers have not used chat in the selected month.",
    totalCost: "Total cost",
    totalTokens: "Total tokens",
    activeUsers: "Active users",
    rateLabel: "Rate",
    colResearcher: "Researcher",
    colSessions: "Sessions",
    colTokens: "Tokens",
    colCost: "Est. cost",
    colMonthlyCap: "Monthly cap",
    colPctCap: "% of cap",
    usersWithUsage: (n) => `${n} with usage`,
    monthSelectAria: "Report month",
    pickMonth: "Pick a month",
  },
  llm: {
    intro:
      "Global LLM policy defaults apply to all users without custom limits. Saved values enforce quota on chat (daily tokens, monthly cost cap, rate limit) and set default temperature. Manage provider API keys in the API Keys tab.",
    providerStatusTitle: "Provider status",
    configured: "Configured",
    missingKey: "Missing key",
    globalDefaultsTitle: "Global defaults & cost model",
    dailyTokenMax: "Default daily token max",
    monthlyCostCap: "Default monthly cost cap (USD)",
    rateLimit: "Default rate limit / min",
    costPer1k: "Est. cost per 1k tokens (USD)",
    minTemperature: "Min temperature",
    maxTemperature: "Max temperature",
    defaultTemperature: "Default temperature",
    serverEnvFoot: (provider, retries) =>
      `Server env: LLM_PROVIDER=${provider} · max_style_retries=${retries}`,
  },
  llmKeys: {
    intro:
      "Manage encrypted API keys for every LLM provider on the platform. Priority 0 is primary; 1–9 are backups used on auth/quota errors. .env keys remain fallback when no admin key is set.",
    loading: "Loading provider keys…",
    loadError: "Could not load provider keys.",
    summary: (configured, total) => `${configured} of ${total} providers have an API key`,
    configured: "Key available",
    missingKey: "No key",
    envFallbackHint: ".env fallback key is configured for this provider.",
    noAdminKeys: "No admin-managed keys yet — add one below or rely on .env.",
    supportedModels: "Models on this platform",
    modelsCount: (n) => `${n} models`,
    newKey: "API key",
    newKeyPlaceholder: "Paste provider API key",
    priority: "Priority",
    priorityHint: "0 = primary, 1–9 = backup (tried in order on auth/quota errors).",
    labelOptional: "Label (optional)",
    labelPlaceholder: "e.g. Production / Backup",
    saveKey: "Save key",
    saved: "API key saved",
    saveError: "Could not save API key",
    keyRequired: "Enter an API key",
    test: "Test",
    testDraft: "Test draft key",
    testActive: "Test active key",
    testModel: "Model for connection test",
    testOk: (ms) => `Connection OK (${ms} ms)`,
    testFail: "Connection failed",
    testError: "Test request failed",
    testSavedHint: "Test passed — click Save key so chat uses this key (draft-only tests do not apply to the editor).",
    saveBeforeChat: "Save key before using chat — Test draft only checks the typed key, not the running server config.",
    deleted: "Key removed",
    deleteError: "Could not delete key",
    cleared: "All admin keys cleared for provider",
    clearError: "Could not clear keys",
    clearAdminKeys: "Clear all admin keys",
    inactive: "Inactive",
    lastVerified: "Verified",
    googleTestHint:
      "403 PERMISSION_DENIED usually means Google blocked the GCP project (Trust & Safety), not a bad key. Check AI Studio for a banner or create a new project + key.",
  },
  templates: {
    intro:
      "Manage LaTeX templates shown in the public gallery. Upload a preview image and sample PDF so researchers can browse before opening a template.",
    addTemplate: "Add template",
    count: (n) => `${n} template${n === 1 ? "" : "s"}`,
    loading: "Loading templates…",
    emptyTitle: "No templates yet",
    emptyHint: "Create a template to show it in the gallery.",
    colTemplate: "Template",
    colAssets: "Assets",
    colMeta: "Details",
    colActions: "Actions",
    preview: "Preview",
    pdf: "PDF",
    hasAsset: "Ready",
    missingAsset: "Missing",
    edit: "Edit",
    uploadPreview: "Upload preview",
    uploadPdf: "Upload PDF",
    delete: "Delete",
    official: "Official",
    journal: "Journal",
    conference: "Conference",
    addDialogTitle: "Add template",
    editDialogTitle: "Edit template",
    dialogHint: "Set metadata and LaTeX source. ID must be a lowercase slug (e.g. ieee-journal).",
    templateId: "Template ID",
    format: "Format",
    title: "Title",
    titleVi: "Title (Vietnamese)",
    description: "Description",
    abstract: "Abstract",
    author: "Author",
    venue: "Venue",
    tags: "Tags (comma-separated)",
    officialTemplate: "Official template",
    latexSource: "LaTeX source (main.tex)",
    createTemplate: "Create template",
    saveChanges: "Save changes",
    loadingTemplate: "Loading template…",
    confirmDelete: (id) => `Delete template "${id}"?`,
    toastCreated: "Template created",
    toastSaved: "Template saved",
    toastDeleted: "Deleted",
    toastPreviewUploaded: "Preview uploaded",
    toastPdfUploaded: "PDF uploaded",
    errLoad: "Could not load templates",
    errLoadTemplate: "Could not load template",
    errSave: "Save failed",
    errDelete: "Delete failed",
    errUpload: "Upload failed",
    errIdRequired: "Template ID is required.",
    errTitleRequired: "Title is required.",
    errLatexRequired: "LaTeX source is required.",
  },
};

const VI: AdminCopy = {
  consoleEyebrow: "Bảng quản trị",
  platformControl: "Điều khiển nền tảng",
  signOut: "Đăng xuất",
  godAdmin: "God Admin",
  platformOperator: "Quản trị viên",
  loading: "Đang tải bảng quản trị…",
  retry: "Thử lại",
  cancel: "Huỷ",
  confirm: "Xác nhận",
  saveDefaults: "Lưu mặc định",
  unsavedDefaults: "Chưa lưu thay đổi",
  protectedAccount: "Được bảo vệ",
  loadError: "Không tải được dữ liệu quản trị.",
  costLoadError: "Không tải được báo cáo chi phí.",
  updateFailed: "Cập nhật thất bại",
  defaultsSaved: "Đã lưu mặc định LLM toàn nền tảng",
  saveFailed: "Lưu thất bại",
  roleResearcher: "Nghiên cứu viên",
  roleAdmin: "Quản trị",
  tabs: {
    overview: "Tổng quan",
    users: "Người dùng & Hạn mức",
    cost: "Báo cáo chi phí",
    llm: "Chính sách LLM",
    llmKeys: "API Keys",
    templates: "Mẫu LaTeX",
  },
  overview: {
    noSessionsTitle: "Chưa có AI session nào",
    noSessionsHint: "Usage và cost sẽ xuất hiện sau khi researcher dùng chat trong editor.",
    totalUsers: "Tổng users",
    totalUsersHint: (active, admins) => `${active} hoạt động · ${admins} quản trị`,
    tokensToday: "Tokens hôm nay",
    tokensTodayHint: (total, sessions) =>
      `Tổng: ${total.toLocaleString("vi-VN")} tok · ${sessions.toLocaleString("vi-VN")} phiên`,
    monthCost: "Chi phí tháng này",
    monthCostHint: (total) => `Tổng: ${total}`,
    quotaWarnings: "Cảnh báo hạn mức",
    quotaWarningsHint: (overDaily, overMonthly) =>
      `${overDaily} vượt token/ngày · ${overMonthly} vượt chi phí/tháng`,
    newUsersTitle: "User mới",
    newUsersRecent: "Gần đây",
    newUsers7d: "7 ngày qua",
    newUsers30d: "30 ngày qua",
    recentUsersTitle: "Đăng ký gần đây",
    noRecentUsers: "Chưa có user",
    colUser: "Người dùng",
    colProvider: "Đăng nhập",
    colRole: "Vai trò",
    colJoined: "Tham gia",
    colLastActive: "Hoạt động cuối",
    llmStackTitle: "LLM mặc định nền tảng",
    defaultProvider: "Provider mặc định",
    defaultModel: "Model mặc định",
    temperature: "Nhiệt độ",
    integrity: "Kiểm tra nội dung",
    providersTitle: "Providers & models",
    configured: "Đã có API key",
    notConfigured: "Chưa cấu hình",
    modelsAvailable: "Danh sách model",
    defaultBadge: "mặc định",
  },
  users: {
    intro:
      "Quản lý tài khoản researcher, role và hạn mức LLM. Cột Hôm nay = token trong ngày (so với daily cap); Tháng này = chi phí tháng hiện tại (so với monthly cap) — khớp logic chặn chat thật.",
    searchPlaceholder: "Tìm theo tên, email, role…",
    searchAria: "Tìm user",
    count: (shown, total) => `${shown}/${total} người dùng`,
    emptyTitle: "Không tìm thấy người dùng",
    emptyHint: "Thử tìm bằng email hoặc tên khác.",
    colResearcher: "Người dùng",
    colRole: "Vai trò",
    colToday: "Hôm nay / Hạn ngày",
    colMonth: "Tháng này / Hạn tháng",
    colStatus: "Trạng thái",
    colActions: "Thao tác",
    dailyCap: (cap) => `hạn: ${cap} / ngày`,
    monthlyCap: (cap) => `hạn: ${cap} / tháng`,
    overDaily: "Vượt hạn ngày",
    overMonthly: "Vượt hạn tháng",
    active: "Hoạt động",
    inactive: "Vô hiệu",
    limits: "Hạn mức",
    promote: "Nâng quyền",
    demote: "Hạ quyền",
    disable: "Vô hiệu",
    enable: "Kích hoạt",
    confirmDisable: (name) => `Vô hiệu hoá tài khoản "${name}"?`,
    confirmEnable: (name) => `Kích hoạt lại "${name}"?`,
    confirmDemote: (name) => `Đổi "${name}" về RESEARCHER?`,
    confirmPromote: (name) => `Nâng "${name}" lên quản trị?`,
    toastEnabled: "Đã kích hoạt tài khoản",
    toastDisabled: "Đã vô hiệu hoá tài khoản",
    toastRole: (role) => `Đã đổi vai trò thành ${role}`,
    limitsSaved: "Đã lưu hạn mức LLM",
    lastActive: "Hoạt động cuối",
    joined: "Tham gia",
    editLimits: "Chỉnh hạn mức LLM",
    dailyTokenMax: "Token tối đa / ngày",
    monthlyCostCap: "Hạn chi phí tháng (USD)",
    rateLimit: "Giới hạn tốc độ / phút",
    llmEnabled: "Bật LLM",
    saveLimits: "Lưu hạn mức",
  },
  cost: {
    intro:
      "Chi phí LLM ước tính theo tháng. Công thức: tokens × đơn giá / 1k tokens (cấu hình tại tab Chính sách LLM).",
    reportMonth: "Tháng báo cáo",
    hideUnused: "Chỉ hiện user đã dùng",
    loading: "Đang tải báo cáo chi phí…",
    emptyTitle: "Chưa có usage trong tháng này",
    emptyHintFiltered: "Bỏ chọn “Chỉ hiện user đã dùng” để xem toàn bộ danh sách.",
    emptyHintNoUsage: "Researcher chưa dùng chat trong tháng đã chọn.",
    totalCost: "Tổng chi phí",
    totalTokens: "Tổng tokens",
    activeUsers: "User có usage",
    rateLabel: "Đơn giá",
    colResearcher: "Người dùng",
    colSessions: "Phiên",
    colTokens: "Tokens",
    colCost: "Chi phí ước tính",
    colMonthlyCap: "Hạn tháng",
    colPctCap: "% hạn mức",
    usersWithUsage: (n) => `${n} người có usage`,
    monthSelectAria: "Chọn tháng báo cáo",
    pickMonth: "Chọn tháng",
  },
  llm: {
    intro:
      "Mặc định chính sách LLM áp dụng cho mọi user chưa có hạn mức riêng. Giá trị lưu tại đây kiểm soát quota chat và nhiệt độ mặc định. Quản lý API key provider tại tab API Keys.",
    providerStatusTitle: "Trạng thái provider",
    configured: "Đã cấu hình",
    missingKey: "Thiếu API key",
    globalDefaultsTitle: "Mặc định toàn nền tảng & mô hình chi phí",
    dailyTokenMax: "Token tối đa / ngày (mặc định)",
    monthlyCostCap: "Hạn chi phí tháng (USD, mặc định)",
    rateLimit: "Giới hạn tốc độ / phút (mặc định)",
    costPer1k: "Chi phí ước tính / 1k tokens (USD)",
    minTemperature: "Nhiệt độ tối thiểu",
    maxTemperature: "Nhiệt độ tối đa",
    defaultTemperature: "Nhiệt độ mặc định",
    serverEnvFoot: (provider, retries) =>
      `Biến server: LLM_PROVIDER=${provider} · max_style_retries=${retries}`,
  },
  llmKeys: {
    intro:
      "Quản lý API key mã hoá cho mọi provider LLM trên nền tảng. Priority 0 là key chính; 1–9 là dự phòng khi lỗi auth/quota. Key .env vẫn là fallback nếu chưa có key admin.",
    loading: "Đang tải API key…",
    loadError: "Không tải được API key provider.",
    summary: (configured, total) => `${configured}/${total} provider đã có API key`,
    configured: "Có key",
    missingKey: "Chưa có key",
    envFallbackHint: "Provider này có key fallback trong .env.",
    noAdminKeys: "Chưa có key admin — thêm bên dưới hoặc dùng .env.",
    supportedModels: "Model trên hệ thống",
    modelsCount: (n) => `${n} model`,
    newKey: "API key",
    newKeyPlaceholder: "Dán API key của provider",
    priority: "Priority",
    priorityHint: "0 = chính, 1–9 = dự phòng (thử lần lượt khi lỗi auth/quota).",
    labelOptional: "Nhãn (tuỳ chọn)",
    labelPlaceholder: "vd. Production / Backup",
    saveKey: "Lưu key",
    saved: "Đã lưu API key",
    saveError: "Không lưu được API key",
    keyRequired: "Nhập API key",
    test: "Kiểm tra",
    testDraft: "Test key nhập",
    testActive: "Test key đang dùng",
    testModel: "Model để test kết nối",
    testOk: (ms) => `Kết nối OK (${ms} ms)`,
    testFail: "Kết nối thất bại",
    testError: "Không gửi được yêu cầu test",
    testSavedHint: "Test OK — bấm Lưu key để chat dùng key này (test nháp không áp dụng cho editor).",
    saveBeforeChat: "Cần Lưu key trước khi chat — Test draft chỉ thử key đang gõ, không đổi cấu hình server.",
    deleted: "Đã xóa key",
    deleteError: "Không xóa được key",
    cleared: "Đã xóa mọi key admin của provider",
    clearError: "Không xóa được key",
    clearAdminKeys: "Xóa mọi key admin",
    inactive: "Tắt",
    lastVerified: "Đã kiểm tra",
    googleTestHint:
      "403 PERMISSION_DENIED thường do Google chặn project GCP (Trust & Safety), không phải key sai. Kiểm tra banner tại AI Studio hoặc tạo project + key mới.",
  },
  templates: {
    intro:
      "Quản lý mẫu LaTeX hiển thị trong gallery công khai. Tải ảnh preview và PDF mẫu để researcher xem trước khi mở mẫu.",
    addTemplate: "Thêm mẫu",
    count: (n) => `${n} mẫu`,
    loading: "Đang tải mẫu…",
    emptyTitle: "Chưa có mẫu",
    emptyHint: "Tạo mẫu mới để hiển thị trong gallery.",
    colTemplate: "Mẫu",
    colAssets: "Tài nguyên",
    colMeta: "Chi tiết",
    colActions: "Thao tác",
    preview: "Ảnh",
    pdf: "PDF",
    hasAsset: "Có",
    missingAsset: "Thiếu",
    edit: "Sửa",
    uploadPreview: "Tải ảnh",
    uploadPdf: "Tải PDF",
    delete: "Xóa",
    official: "Chính thức",
    journal: "Tạp chí",
    conference: "Hội nghị",
    addDialogTitle: "Thêm mẫu",
    editDialogTitle: "Sửa mẫu",
    dialogHint: "Nhập metadata và nguồn LaTeX. ID phải là slug chữ thường (vd. ieee-journal).",
    templateId: "ID mẫu",
    format: "Định dạng",
    title: "Tiêu đề",
    titleVi: "Tiêu đề (tiếng Việt)",
    description: "Mô tả",
    abstract: "Tóm tắt",
    author: "Tác giả",
    venue: "Loại",
    tags: "Tags (phân cách bằng dấu phẩy)",
    officialTemplate: "Mẫu chính thức",
    latexSource: "Nguồn LaTeX (main.tex)",
    createTemplate: "Tạo mẫu",
    saveChanges: "Lưu thay đổi",
    loadingTemplate: "Đang tải mẫu…",
    confirmDelete: (id) => `Xóa mẫu "${id}"?`,
    toastCreated: "Đã tạo mẫu",
    toastSaved: "Đã lưu mẫu",
    toastDeleted: "Đã xóa",
    toastPreviewUploaded: "Đã tải ảnh preview",
    toastPdfUploaded: "Đã tải PDF",
    errLoad: "Không tải được danh sách mẫu",
    errLoadTemplate: "Không tải được mẫu",
    errSave: "Lưu thất bại",
    errDelete: "Xóa thất bại",
    errUpload: "Tải lên thất bại",
    errIdRequired: "Cần nhập ID mẫu.",
    errTitleRequired: "Cần nhập tiêu đề.",
    errLatexRequired: "Cần nhập nguồn LaTeX.",
  },
};

export function adminCopy(lang: UiLanguage): AdminCopy {
  return lang === "vi" ? VI : EN;
}

export function adminLocaleTag(lang: UiLanguage): string {
  return lang === "vi" ? "vi-VN" : "en-US";
}
