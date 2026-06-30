import type { UiLanguage } from "@/lib/researcher-profile";

export type GuideDemoId = "projects" | "editor" | "chat" | "compile" | "defense" | "account";

export type GuideStep = {
  id: GuideDemoId;
  step: string;
  title: string;
  description: string;
};

export type GuideDemoLabels = {
  projectsChrome: string;
  newBtn: string;
  editorChrome: string;
  files: string;
  source: string;
  preview: string;
  compileChrome: string;
  compileBtn: string;
  compiling: string;
  defenseChrome: string;
  council: string;
  accountChrome: string;
  plan: string;
  profile: string;
};

export type GuidePageContent = {
  title: string;
  lede: string;
  demo: GuideDemoLabels;
  steps: GuideStep[];
  cta: string;
};

const EN: GuidePageContent = {
  title: "User Guide",
  lede: "Six steps to use Arionear — only what you see in Projects, the editor, and the sidebar.",
  demo: {
    projectsChrome: "Your Projects",
    newBtn: "+ New",
    editorChrome: "Editor · main.tex",
    files: "Files",
    source: "LaTeX",
    preview: "PDF",
    compileChrome: "Compile & export",
    compileBtn: "Compile",
    compiling: "Building PDF…",
    defenseChrome: "Defense rehearsal",
    council: "Review council",
    accountChrome: "Workspace sidebar",
    plan: "Plan",
    profile: "Profile",
  },
  steps: [
    {
      id: "projects",
      step: "01",
      title: "Create or import a project",
      description:
        "Open Projects from the sidebar. Use + New to start a blank or sample IEEEtran IMRaD manuscript, or import an Overleaf ZIP or project folder. Click a row to open the editor.",
    },
    {
      id: "editor",
      step: "02",
      title: "Edit in the desk layout",
      description:
        "Left — file tree and outline. Center — LaTeX source with undo/redo. Right — PDF preview after Compile. Ario chat sits in the bottom-right dock.",
    },
    {
      id: "chat",
      step: "03",
      title: "Chat with Ario · Accept or Refuse",
      description:
        "Ask Ario to polish style, check citations, or review logic. Style edits show as a diff — nothing is saved until you Accept. Refuse to dismiss.",
    },
    {
      id: "compile",
      step: "04",
      title: "Compile PDF & export",
      description:
        "Click Compile in the toolbar to build a PDF preview (SyncTeX: double-click PDF to jump to source). Export opens the publication-readiness score and PDF download.",
    },
    {
      id: "defense",
      step: "05",
      title: "Defense rehearsal",
      description:
        "From a project row (graduation cap) or the editor toolbar, open Defense to practice a mock viva. Your paper PDF appears beside the council chat.",
    },
    {
      id: "account",
      step: "06",
      title: "Profile & plan",
      description:
        "Profile — name, affiliation, research field, and LLM preferences. Plan — view quota and upgrade to Pro. Language and theme toggles live in the sidebar footer.",
    },
  ],
  cta: "Go to your projects",
};

const VI: GuidePageContent = {
  title: "Hướng dẫn sử dụng",
  lede: "Sáu bước dùng Arionear — chỉ những gì bạn thấy trong Dự án, editor và sidebar.",
  demo: {
    projectsChrome: "Dự án của bạn",
    newBtn: "+ Mới",
    editorChrome: "Editor · main.tex",
    files: "File",
    source: "LaTeX",
    preview: "PDF",
    compileChrome: "Biên dịch & xuất",
    compileBtn: "Biên dịch",
    compiling: "Đang tạo PDF…",
    defenseChrome: "Luyện phản biện",
    council: "Hội đồng",
    accountChrome: "Sidebar workspace",
    plan: "Gói",
    profile: "Hồ sơ",
  },
  steps: [
    {
      id: "projects",
      step: "01",
      title: "Tạo hoặc nhập dự án",
      description:
        "Mở Dự án từ sidebar. Dùng + Mới để tạo bản thảo IEEEtran IMRaD trống hoặc mẫu, hoặc nhập ZIP Overleaf / thư mục dự án. Click tên dự án để mở editor.",
    },
    {
      id: "editor",
      step: "02",
      title: "Biên tập trên bàn làm việc",
      description:
        "Trái — cây file và outline. Giữa — nguồn LaTeX với undo/redo. Phải — xem trước PDF sau Biên dịch. Chat Ario ở góc dưới-phải.",
    },
    {
      id: "chat",
      step: "03",
      title: "Chat Ario · Accept hoặc Refuse",
      description:
        "Nhờ Ario chỉnh văn phong, kiểm tra trích dẫn hoặc logic. Style edit hiện diff — chỉ lưu khi bạn Accept. Refuse để bỏ qua.",
    },
    {
      id: "compile",
      step: "04",
      title: "Biên dịch PDF & xuất bản",
      description:
        "Nhấn Biên dịch trên toolbar để tạo PDF (SyncTeX: double-click PDF để nhảy tới nguồn). Xuất mở điểm sẵn sàng xuất bản và tải PDF.",
    },
    {
      id: "defense",
      step: "05",
      title: "Luyện phản biện",
      description:
        "Từ dòng dự án (icon mũ tốt nghiệp) hoặc toolbar editor, mở Bảo vệ để luyện viva giả. PDF bài báo hiện cạnh chat hội đồng.",
    },
    {
      id: "account",
      step: "06",
      title: "Hồ sơ & gói",
      description:
        "Hồ sơ — tên, đơn vị, lĩnh vực, tùy chọn LLM. Gói — xem quota và nâng cấp Pro. Chuyển ngôn ngữ và giao diện ở footer sidebar.",
    },
  ],
  cta: "Đến dự án của bạn",
};

export function guideCopy(lang: UiLanguage): GuidePageContent {
  return lang === "vi" ? VI : EN;
}
