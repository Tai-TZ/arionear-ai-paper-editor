import type { UiLanguage } from "@/lib/researcher-profile";

type ProfileCopy = {
  pageTitle: string;
  pageSubtitle: string;
  save: string;
  saving: string;
  saved: string;
  unsaved: string;
  loadError: string;
  saveError: string;
  completeness: string;
  navProjects: string;
  navProfile: string;
  signOut: string;
  sections: {
    identity: string;
    research: string;
    writing: string;
    ai: string;
    workflow: string;
    privacy: string;
  };
  fields: Record<string, string>;
  hints: Record<string, string>;
  footer: {
    signedInAs: (email: string) => string;
    lastUpdated: string;
  };
};

const EN: ProfileCopy = {
  pageTitle: "Researcher Profile",
  pageSubtitle: "Personalize your workspace, AI assistant, and editorial defaults.",
  save: "Save changes",
  saving: "Saving…",
  saved: "Profile saved",
  unsaved: "You have unsaved changes",
  loadError: "Could not load your profile.",
  saveError: "Could not save profile.",
  completeness: "Profile completeness",
  navProjects: "Projects",
  navProfile: "Profile",
  signOut: "Sign out",
  sections: {
    identity: "Identity & affiliation",
    research: "Research context",
    writing: "Writing & citations",
    ai: "AI assistant",
    workflow: "Editor workflow",
    privacy: "Privacy & data",
  },
  fields: {
    name: "Full name",
    email: "Email",
    affiliation: "Institution",
    department: "Department",
    position: "Position",
    native_language: "Native language",
    research_field: "Research field",
    orcid: "ORCID iD",
    google_scholar: "Google Scholar URL",
    avatar_url: "Avatar image URL",
    timezone: "Timezone",
    ui_language: "Interface language",
    paper_type: "Paper type",
    target_venue: "Target venue",
    target_deadline: "Target deadline",
    default_template: "Default LaTeX template",
    citation_style: "Citation style",
    writing_locale: "Writing locale",
    default_llm_provider: "Default LLM provider",
    default_llm_model: "Preferred model",
    rewrite_intensity: "Rewrite intensity",
    integrity_strictness: "Integrity guard level",
    auto_compile: "Auto-compile after save",
    auto_save: "Auto-save while editing",
    synctex_highlight_ms: "SyncTeX highlight duration (ms)",
    store_drafts: "Store draft versions",
    telemetry_opt_in: "Anonymous usage analytics",
  },
  hints: {
    orcid: "Format: 0000-0000-0000-0000",
    auto_compile: "Runs LaTeX compile automatically when you save.",
    auto_save: "Saves your project every few seconds while you edit.",
    integrity: "Higher levels apply stricter checks on AI suggestions.",
    telemetry: "Helps improve Edico — no manuscript content is sent.",
  },
  footer: {
    signedInAs: (email) => `Signed in as ${email}`,
    lastUpdated: "Last updated",
  },
};

const VI: ProfileCopy = {
  pageTitle: "Hồ sơ Nhà nghiên cứu",
  pageSubtitle: "Tùy chỉnh workspace, trợ lý AI và mặc định biên tập học thuật.",
  save: "Lưu thay đổi",
  saving: "Đang lưu…",
  saved: "Đã lưu hồ sơ",
  unsaved: "Bạn có thay đổi chưa lưu",
  loadError: "Không tải được hồ sơ.",
  saveError: "Không lưu được hồ sơ.",
  completeness: "Mức hoàn thiện hồ sơ",
  navProjects: "Dự án",
  navProfile: "Hồ sơ",
  signOut: "Đăng xuất",
  sections: {
    identity: "Thông tin & đơn vị",
    research: "Bối cảnh nghiên cứu",
    writing: "Viết & trích dẫn",
    ai: "Trợ lý AI",
    workflow: "Quy trình biên tập",
    privacy: "Quyền riêng tư & dữ liệu",
  },
  fields: {
    name: "Họ và tên",
    email: "Email",
    affiliation: "Cơ quan / Trường",
    department: "Khoa / Bộ môn",
    position: "Chức danh",
    native_language: "Ngôn ngữ mẹ đẻ",
    research_field: "Lĩnh vực nghiên cứu",
    orcid: "ORCID iD",
    google_scholar: "URL Google Scholar",
    avatar_url: "URL ảnh đại diện",
    timezone: "Múi giờ",
    ui_language: "Ngôn ngữ giao diện",
    paper_type: "Loại bài báo",
    target_venue: "Tạp chí / Hội nghị mục tiêu",
    target_deadline: "Hạn nộp",
    default_template: "Mẫu LaTeX mặc định",
    citation_style: "Kiểu trích dẫn",
    writing_locale: "Locale viết",
    default_llm_provider: "Nhà cung cấp LLM mặc định",
    default_llm_model: "Model ưu tiên",
    rewrite_intensity: "Mức chỉnh sửa",
    integrity_strictness: "Mức Integrity Guard",
    auto_compile: "Tự biên dịch sau khi lưu",
    auto_save: "Tự lưu khi chỉnh sửa",
    synctex_highlight_ms: "Thời gian highlight SyncTeX (ms)",
    store_drafts: "Lưu bản nháp",
    telemetry_opt_in: "Phân tích sử dụng ẩn danh",
  },
  hints: {
    orcid: "Định dạng: 0000-0000-0000-0000",
    auto_compile: "Chạy LaTeX tự động khi bạn lưu.",
    auto_save: "Lưu dự án mỗi vài giây khi bạn chỉnh sửa.",
    integrity: "Mức cao hơn = kiểm tra chặt hơn với gợi ý AI.",
    telemetry: "Giúp cải thiện Edico — không gửi nội dung bản thảo.",
  },
  footer: {
    signedInAs: (email) => `Đã đăng nhập với ${email}`,
    lastUpdated: "Cập nhật lần cuối",
  },
};

export function profileCopy(lang: UiLanguage): ProfileCopy {
  return lang === "vi" ? VI : EN;
}
