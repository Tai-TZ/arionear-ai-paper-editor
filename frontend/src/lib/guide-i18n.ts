import type { UiLanguage } from "@/lib/researcher-profile";

export type GuideSample = {
  task: string;
  prompt: string;
  expect: string;
};

export type GuideShortcut = {
  keys: string;
  description: string;
};

export type GuideSection = {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  samples?: GuideSample[];
  shortcuts?: GuideShortcut[];
};

export type GuidePageContent = {
  title: string;
  eyebrow: string;
  lede: string;
  tocTitle: string;
  samplesTitle: string;
  shortcutsTitle: string;
  openEditorCta: string;
  relatedTitle: string;
  relatedLinks: { label: string; to: string }[];
  sections: GuideSection[];
};

const EN: GuidePageContent = {
  title: "User Guide",
  eyebrow: "Authors · Desk Manual",
  lede:
    "A practical walkthrough for researchers using Arionear — from your first project to Accept/Reject on AI suggestions and PDF compile.",
  tocTitle: "On this page",
  samplesTitle: "Try these prompts in chat",
  shortcutsTitle: "Keyboard shortcuts",
  openEditorCta: "Open your projects",
  relatedTitle: "Related",
  relatedLinks: [
    { label: "Workflow overview", to: "/workflow" },
    { label: "LaTeX guide", to: "/latex-guide" },
    { label: "Integrity policy", to: "/integrity" },
  ],
  sections: [
    {
      id: "start",
      heading: "1 · Create an account & open a project",
      paragraphs: [
        "Sign up or sign in, then open Projects from the masthead or sidebar.",
        "Start with a blank manuscript, the sample template, or upload LaTeX — a single `.tex` file, a folder, or an Overleaf ZIP export.",
      ],
      bullets: [
        "Blank project — empty `main.tex` ready to type",
        "Sample project — short IMRAD-style starter you can edit",
        "Import — `.tex`, figures (`.png`, `.pdf`, …), and support files (`.bib`, `.cls`, `.sty`)",
      ],
    },
    {
      id: "editor",
      heading: "2 · Editor layout",
      paragraphs: [
        "The desk is split into source, tools, and preview. Your manuscript saves to your account when you edit or leave the session.",
      ],
      bullets: [
        "Left — file tree & outline: switch files, upload assets, jump to sections",
        "Center — LaTeX source editor with undo/redo",
        "Right — PDF preview after Compile; double-click PDF to jump to source (SyncTeX)",
        "Bottom-right — Ario chat dock: ask questions or request edits",
      ],
    },
    {
      id: "chat",
      heading: "3 · Chat with Ario",
      paragraphs: [
        "Open the chat dock and describe what you need. Ario reads your current manuscript context. Pick a task or let the intent router choose.",
        "Style and template tasks return tracked changes (diff). Chat and structure tasks return analysis without auto-editing.",
      ],
      samples: [
        {
          task: "Chat",
          prompt: "Explain the abstract of this paper briefly in Vietnamese",
          expect: "Answer in chat — no diff applied",
        },
        {
          task: "Style",
          prompt: "Polish the abstract for a more formal academic tone",
          expect: "Red/green diff — Accept or Refuse before it lands in source",
        },
        {
          task: "Structure",
          prompt: "Analyze the IMRaD structure of this manuscript",
          expect: "Section-by-section notes on what is missing or weak",
        },
        {
          task: "Template",
          prompt: "Add missing IMRaD sections as a skeleton",
          expect: "Suggested section blocks you can accept into the draft",
        },
        {
          task: "Citation",
          prompt: "Check citations in this paper",
          expect: "Verification report per cite key (arXiv, CrossRef, Semantic Scholar)",
        },
      ],
    },
    {
      id: "diff",
      heading: "4 · Accept or Refuse suggestions",
      paragraphs: [
        "Every AI edit passes the author gate. Nothing is committed until you approve.",
      ],
      bullets: [
        "Review the inline diff in the editor — deletions in red, additions highlighted",
        "Accept — apply the suggestion to your LaTeX source",
        "Refuse — dismiss without changing the manuscript",
        "Multiple edits — accept or refuse one at a time when Ario proposes a batch",
        "Revision history — past suggestions are listed in the Tools panel",
      ],
    },
    {
      id: "quick-edit",
      heading: "5 · Quick edit selection",
      paragraphs: [
        "Select text in the editor, then use Quick Edit (Ctrl+K / Cmd+K) for a focused rewrite of that passage only.",
      ],
      bullets: [
        "Example: select a paragraph → Quick Edit → “Rewrite this paragraph in a more formal tone”",
        "Works like style edit but scoped to your selection",
      ],
      shortcuts: [{ keys: "Ctrl+K", description: "Quick edit on selected text (Cmd+K on macOS)" }],
    },
    {
      id: "compile",
      heading: "6 · Compile PDF",
      paragraphs: [
        "Click Compile in the toolbar to build a PDF preview. The log panel shows errors if TeX fails.",
        "Server-side TeX Live must be installed on the backend. Install MiKTeX/TeX Live locally for development.",
      ],
      bullets: [
        "Supports pdflatex, xelatex, lualatex (auto-detected from manuscript)",
        "SyncTeX — double-click a word in the PDF to scroll the source",
      ],
    },
    {
      id: "tools",
      heading: "7 · Tools panel",
      paragraphs: ["Open Tools from the editor sidebar for citation checks and revision audit."],
      bullets: [
        "Citation verify — cross-check `\\cite{...}` keys against your `.bib` and external databases",
        "Logic audit — optional section-level consistency check (when enabled)",
        "Share link — generate a read-only view for collaborators (if enabled for your project)",
      ],
    },
    {
      id: "profile",
      heading: "8 · Profile & preferences",
      paragraphs: [
        "Open Profile from the workspace sidebar to set your name, affiliation, research field, and AI preferences.",
        "Language (EN/VI) and theme follow your browser session; profile defaults can guide Ario’s tone.",
      ],
    },
    {
      id: "shortcuts",
      heading: "9 · Shortcuts & tips",
      paragraphs: ["Keep the manuscript saved; use the sample queries above to explore each AI task safely."],
      shortcuts: [
        { keys: "Ctrl+K", description: "Quick edit selection" },
        { keys: "Ctrl+Z / Ctrl+Y", description: "Undo / redo in editor" },
        { keys: "Ctrl+Enter", description: "Send chat message (when chat is focused)" },
      ],
    },
  ],
};

const VI: GuidePageContent = {
  title: "Hướng dẫn sử dụng",
  eyebrow: "Tác giả · Sổ tay bàn biên tập",
  lede:
    "Hướng dẫn thực hành cho researcher dùng Arionear — từ dự án đầu tiên đến Accept/Reject gợi ý AI và biên dịch PDF.",
  tocTitle: "Mục lục",
  samplesTitle: "Thử các prompt sau trong chat",
  shortcutsTitle: "Phím tắt",
  openEditorCta: "Mở dự án của bạn",
  relatedTitle: "Xem thêm",
  relatedLinks: [
    { label: "Tổng quan quy trình", to: "/workflow" },
    { label: "Hướng dẫn LaTeX", to: "/latex-guide" },
    { label: "Chính sách toàn vẹn", to: "/integrity" },
  ],
  sections: [
    {
      id: "start",
      heading: "1 · Tạo tài khoản & mở dự án",
      paragraphs: [
        "Đăng ký hoặc đăng nhập, rồi mở Dự án từ masthead hoặc sidebar.",
        "Bắt đầu bằng bản thảo trống, mẫu có sẵn, hoặc tải LaTeX — một file `.tex`, thư mục, hoặc ZIP xuất từ Overleaf.",
      ],
      bullets: [
        "Dự án trống — `main.tex` rỗng sẵn sàng gõ",
        "Dự án mẫu — bản IMRAD ngắn để chỉnh sửa",
        "Nhập — `.tex`, hình (`.png`, `.pdf`, …) và file hỗ trợ (`.bib`, `.cls`, `.sty`)",
      ],
    },
    {
      id: "editor",
      heading: "2 · Bố cục trình biên tập",
      paragraphs: [
        "Bàn biên tập chia thành nguồn, công cụ và xem trước. Bản thảo lưu vào tài khoản khi bạn sửa hoặc rời phiên.",
      ],
      bullets: [
        "Trái — cây file & outline: đổi file, tải asset, nhảy tới section",
        "Giữa — editor LaTeX với undo/redo",
        "Phải — xem trước PDF sau Biên dịch; double-click PDF để nhảy tới nguồn (SyncTeX)",
        "Dưới-phải — chat Ario: hỏi đáp hoặc yêu cầu chỉnh sửa",
      ],
    },
    {
      id: "chat",
      heading: "3 · Chat với Ario",
      paragraphs: [
        "Mở chat dock và mô tả nhu cầu. Ario đọc ngữ cảnh bản thảo hiện tại. Chọn task hoặc để intent router tự phân loại.",
        "Style và template trả về tracked changes (diff). Chat và structure trả về phân tích, không tự sửa.",
      ],
      samples: [
        {
          task: "Chat",
          prompt: "Giải thích ngắn gọn abstract của bài này bằng tiếng Việt",
          expect: "Trả lời trong chat — không áp dụng diff",
        },
        {
          task: "Style",
          prompt: "Chỉnh sửa abstract cho văn phong học thuật hơn",
          expect: "Diff đỏ/xanh — Accept hoặc Refuse trước khi vào nguồn",
        },
        {
          task: "Structure",
          prompt: "Phân tích cấu trúc IMRaD của bài này",
          expect: "Gợi ý section thiếu hoặc yếu",
        },
        {
          task: "Template",
          prompt: "Thêm các section IMRaD còn thiếu",
          expect: "Khung section gợi ý để accept vào bản thảo",
        },
        {
          task: "Citation",
          prompt: "Kiểm tra trích dẫn trong bài",
          expect: "Báo cáo verify từng cite key (arXiv, CrossRef, Semantic Scholar)",
        },
      ],
    },
    {
      id: "diff",
      heading: "4 · Accept hoặc Refuse gợi ý",
      paragraphs: ["Mọi chỉnh sửa AI đều qua cổng tác giả. Không gì được commit nếu bạn chưa duyệt."],
      bullets: [
        "Xem diff inline trong editor — xóa màu đỏ, thêm được highlight",
        "Accept — áp dụng gợi ý vào nguồn LaTeX",
        "Refuse — bỏ qua, không đổi bản thảo",
        "Nhiều chỉnh sửa — accept/refuse từng mục khi Ario đề xuất batch",
        "Lịch sử revision — gợi ý trước đó nằm trong panel Tools",
      ],
    },
    {
      id: "quick-edit",
      heading: "5 · Quick edit vùng chọn",
      paragraphs: [
        "Bôi đen đoạn trong editor, dùng Quick Edit (Ctrl+K / Cmd+K) để viết lại chỉ đoạn đó.",
      ],
      bullets: [
        "Ví dụ: chọn đoạn → Quick Edit → “Viết lại đoạn này trang trọng hơn”",
        "Giống style edit nhưng giới hạn trong vùng chọn",
      ],
      shortcuts: [{ keys: "Ctrl+K", description: "Quick edit vùng chọn (Cmd+K trên macOS)" }],
    },
    {
      id: "compile",
      heading: "6 · Biên dịch PDF",
      paragraphs: [
        "Nhấn Biên dịch trên toolbar để tạo xem trước PDF. Panel log hiện lỗi nếu TeX thất bại.",
        "Backend cần TeX Live. Cài MiKTeX/TeX Live local khi phát triển.",
      ],
      bullets: [
        "Hỗ trợ pdflatex, xelatex, lualatex (tự nhận từ bản thảo)",
        "SyncTeX — double-click từ trong PDF để cuộn tới nguồn",
      ],
    },
    {
      id: "tools",
      heading: "7 · Panel Tools",
      paragraphs: ["Mở Tools từ sidebar editor để kiểm tra trích dẫn và audit revision."],
      bullets: [
        "Citation verify — đối chiếu `\\cite{...}` với `.bib` và cơ sở dữ liệu ngoài",
        "Logic audit — kiểm tra nhất quán theo section (khi bật)",
        "Share link — link chỉ đọc cho cộng tác viên (nếu bật cho dự án)",
      ],
    },
    {
      id: "profile",
      heading: "8 · Hồ sơ & tùy chọn",
      paragraphs: [
        "Mở Hồ sơ từ sidebar workspace để đặt tên, đơn vị, lĩnh vực và tùy chọn AI.",
        "Ngôn ngữ (EN/VI) và theme theo phiên trình duyệt; mặc định hồ sơ có thể định hướng giọng Ario.",
      ],
    },
    {
      id: "shortcuts",
      heading: "9 · Phím tắt & mẹo",
      paragraphs: ["Lưu bản thảo thường xuyên; dùng các prompt mẫu trên để khám phá từng task AI an toàn."],
      shortcuts: [
        { keys: "Ctrl+K", description: "Quick edit vùng chọn" },
        { keys: "Ctrl+Z / Ctrl+Y", description: "Undo / redo trong editor" },
        { keys: "Ctrl+Enter", description: "Gửi tin nhắn chat (khi focus chat)" },
      ],
    },
  ],
};

export function guideCopy(lang: UiLanguage): GuidePageContent {
  return lang === "vi" ? VI : EN;
}
