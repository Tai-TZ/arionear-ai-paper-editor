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
    "A practical walkthrough for researchers using Arionear — projects, templates, Ario chat, logic audit, publication score, defense rehearsal, and PDF compile.",
  tocTitle: "On this page",
  samplesTitle: "Try these prompts in chat",
  shortcutsTitle: "Keyboard shortcuts",
  openEditorCta: "Open your projects",
  relatedTitle: "Related",
  relatedLinks: [
    { label: "LaTeX templates", to: "/templates" },
    { label: "Workflow overview", to: "/workflow" },
    { label: "LaTeX guide", to: "/latex-guide" },
    { label: "Integrity policy", to: "/integrity" },
  ],
  sections: [
    {
      id: "start",
      heading: "1 · Create an account & open a project",
      paragraphs: [
        "Sign up (email + verification code) or sign in — Google SSO is also available. Open Projects from the masthead or sidebar.",
        "Your session is stored in the browser and shared across tabs. By default it lasts 3 days; tick Remember me on sign-in for a longer token (30 days).",
        "Start with a blank manuscript, the sample template, browse LaTeX templates, or import — a single `.tex` file, a folder, or an Overleaf ZIP export.",
      ],
      bullets: [
        "Blank project — empty `main.tex` ready to type",
        "Sample project — short IMRAD-style starter you can edit",
        "Templates gallery (`/templates`) — IEEE and academic `.tex` starters; open one as a new project",
        "Import — `.tex`, figures (`.png`, `.pdf`, …), and support files (`.bib`, `.cls`, `.sty`)",
      ],
    },
    {
      id: "templates",
      heading: "2 · LaTeX templates gallery",
      paragraphs: [
        "Open Templates from the workspace navigation to browse curated journal and conference layouts.",
        "Preview the sample PDF, then Open as Template to create a project pre-filled with the `.tex` tree.",
      ],
      bullets: [
        "Search by keyword (e.g. IEEE, thesis, conference)",
        "Official templates are marked with a badge",
        "Sign in is required before opening a template in the editor",
      ],
    },
    {
      id: "editor",
      heading: "3 · Editor layout",
      paragraphs: [
        "The desk is split into source, tools, and preview. Your manuscript syncs to your account as you edit.",
      ],
      bullets: [
        "Left — file tree & outline: switch files, upload assets, jump to sections",
        "Center — LaTeX source editor with undo/redo",
        "Right — PDF preview after Compile; double-click PDF to jump to source (SyncTeX)",
        "Bottom-right — Ario chat dock: ask questions or request edits",
        "Toolbar — Compile, Export (publication score + PDF), Defense (mock viva), Share link",
      ],
    },
    {
      id: "chat",
      heading: "4 · Chat with Ario",
      paragraphs: [
        "Open the chat dock and describe what you need. Ario reads your current manuscript context. Pick a task or let the intent router choose.",
        "Style and template tasks return tracked changes (diff). Chat, structure, and logic tasks return analysis without auto-editing.",
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
        {
          task: "Logic",
          prompt: "Check logic and consistency across sections",
          expect: "Comment-only conflicts in Tools → Logic Audit (no auto-apply)",
        },
      ],
    },
    {
      id: "diff",
      heading: "5 · Accept or Refuse suggestions",
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
      heading: "6 · Quick edit selection",
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
      heading: "7 · Compile PDF",
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
      heading: "8 · Tools panel",
      paragraphs: [
        "Open Tools from the editor sidebar for project info, citation checks, logic audit, and revision history.",
      ],
      bullets: [
        "Info — project metadata and share link settings",
        "Citations — cross-check `\\cite{...}` keys against your `.bib` and external databases",
        "Logic Audit — multi-agent comment-only review (Quick or Deep; full manuscript or selected sections)",
        "Versions — revision audit trail for accepted/rejected AI suggestions",
        "Chat shortcuts: `/logic`, `/logic full`, `/logic deep`",
      ],
    },
    {
      id: "score",
      heading: "9 · Publication score & export",
      paragraphs: [
        "Click Export in the toolbar to open the publication readiness dialog. Ario may run a quick logic skim first, then shows an overall score (0–100) and dimension breakdown.",
      ],
      bullets: [
        "Dimensions include structure, completeness, citations, compile health, and peer-review signals from logic audit",
        "Download the compiled PDF when compile succeeded",
        "Re-run export after major edits — the gate refreshes when the manuscript changes",
      ],
    },
    {
      id: "defense",
      heading: "10 · Defense mode (mock viva)",
      paragraphs: [
        "From the editor toolbar or Projects card menu, open Defense to rehearse a viva with Ario’s council persona.",
        "Your paper PDF appears beside the chat; citation links in answers can scroll and highlight the PDF.",
      ],
      bullets: [
        "Proactive review — the council reads your paper and asks questions with rising difficulty",
        "Open Q&A — you raise concerns; the council probes deeper",
        "One question per turn; restart the session anytime from the panel header",
        "Free-tier turn quotas may apply — check the counter in the defense UI",
      ],
    },
    {
      id: "profile",
      heading: "11 · Profile & preferences",
      paragraphs: [
        "Open Profile from the workspace sidebar to set your name, affiliation, research field, default LLM provider, and integrity strictness.",
        "Toggle EN/VI and light/dark theme from the sidebar footer — language applies across marketing, auth, projects, and editor.",
      ],
    },
    {
      id: "shortcuts",
      heading: "12 · Shortcuts & tips",
      paragraphs: [
        "Use the sample prompts above to explore each AI task safely. Open User Guide anytime from the Projects header.",
      ],
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
    "Hướng dẫn thực hành cho researcher dùng Arionear — dự án, mẫu LaTeX, chat Ario, kiểm tra logic, điểm xuất bản, luyện bảo vệ và biên dịch PDF.",
  tocTitle: "Mục lục",
  samplesTitle: "Thử các prompt sau trong chat",
  shortcutsTitle: "Phím tắt",
  openEditorCta: "Mở dự án của bạn",
  relatedTitle: "Xem thêm",
  relatedLinks: [
    { label: "Mẫu LaTeX", to: "/templates" },
    { label: "Tổng quan quy trình", to: "/workflow" },
    { label: "Hướng dẫn LaTeX", to: "/latex-guide" },
    { label: "Chính sách toàn vẹn", to: "/integrity" },
  ],
  sections: [
    {
      id: "start",
      heading: "1 · Tạo tài khoản & mở dự án",
      paragraphs: [
        "Đăng ký (email + mã xác minh) hoặc đăng nhập — có thêm Google SSO. Mở Dự án từ masthead hoặc sidebar.",
        "Phiên đăng nhập lưu trên trình duyệt và dùng chung giữa các tab. Mặc định hết hạn sau 3 ngày; tick Ghi nhớ đăng nhập để giữ lâu hơn (30 ngày).",
        "Bắt đầu bằng bản thảo trống, mẫu có sẵn, duyệt thư viện mẫu LaTeX, hoặc nhập — file `.tex`, thư mục, hoặc ZIP từ Overleaf.",
      ],
      bullets: [
        "Dự án trống — `main.tex` rỗng sẵn sàng gõ",
        "Dự án mẫu — bản IMRAD ngắn để chỉnh sửa",
        "Thư viện mẫu (`/templates`) — IEEE và mẫu học thuật; mở thành dự án mới",
        "Nhập — `.tex`, hình (`.png`, `.pdf`, …) và file hỗ trợ (`.bib`, `.cls`, `.sty`)",
      ],
    },
    {
      id: "templates",
      heading: "2 · Thư viện mẫu LaTeX",
      paragraphs: [
        "Mở Mẫu bài từ thanh điều hướng workspace để duyệt layout tạp chí và hội nghị.",
        "Xem trước PDF mẫu, rồi Mở làm mẫu để tạo dự án với cây file `.tex` sẵn có.",
      ],
      bullets: [
        "Tìm theo từ khóa (VD: IEEE, thesis, conference)",
        "Mẫu chính thức có badge đánh dấu",
        "Cần đăng nhập trước khi mở mẫu trong editor",
      ],
    },
    {
      id: "editor",
      heading: "3 · Bố cục trình biên tập",
      paragraphs: [
        "Bàn biên tập chia thành nguồn, công cụ và xem trước. Bản thảo đồng bộ lên tài khoản khi bạn sửa.",
      ],
      bullets: [
        "Trái — cây file & outline: đổi file, tải asset, nhảy tới section",
        "Giữa — editor LaTeX với undo/redo",
        "Phải — xem trước PDF sau Biên dịch; double-click PDF để nhảy tới nguồn (SyncTeX)",
        "Dưới-phải — chat Ario: hỏi đáp hoặc yêu cầu chỉnh sửa",
        "Toolbar — Biên dịch, Xuất (điểm xuất bản + PDF), Bảo vệ (mock viva), Share link",
      ],
    },
    {
      id: "chat",
      heading: "4 · Chat với Ario",
      paragraphs: [
        "Mở chat dock và mô tả nhu cầu. Ario đọc ngữ cảnh bản thảo hiện tại. Chọn task hoặc để intent router tự phân loại.",
        "Style và template trả về tracked changes (diff). Chat, structure và logic trả về phân tích, không tự sửa.",
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
        {
          task: "Logic",
          prompt: "Kiểm tra logic và tính nhất quán giữa các phần",
          expect: "Góp ý comment-only trong Tools → Logic Audit (không auto-apply)",
        },
      ],
    },
    {
      id: "diff",
      heading: "5 · Accept hoặc Refuse gợi ý",
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
      heading: "6 · Quick edit vùng chọn",
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
      heading: "7 · Biên dịch PDF",
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
      heading: "8 · Panel Tools",
      paragraphs: [
        "Mở Tools từ sidebar editor để xem thông tin dự án, trích dẫn, logic audit và lịch sử revision.",
      ],
      bullets: [
        "Info — metadata dự án và cài đặt share link",
        "Citations — đối chiếu `\\cite{...}` với `.bib` và cơ sở dữ liệu ngoài",
        "Logic Audit — phản biện đa agent, chỉ comment (Quick hoặc Deep; toàn bộ hoặc chọn section)",
        "Versions — nhật ký accept/reject gợi ý AI",
        "Lệnh chat: `/logic`, `/logic full`, `/logic deep`",
      ],
    },
    {
      id: "score",
      heading: "9 · Điểm xuất bản & xuất file",
      paragraphs: [
        "Nhấn Xuất trên toolbar để mở hộp thoại sẵn sàng xuất bản. Ario có thể chạy logic skim nhanh trước, rồi hiện điểm tổng (0–100) và các chiều đánh giá.",
      ],
      bullets: [
        "Các chiều gồm cấu trúc, độ đầy đủ, trích dẫn, tình trạng biên dịch và tín hiệu phản biện từ logic audit",
        "Tải PDF đã biên dịch khi compile thành công",
        "Chạy lại Xuất sau khi sửa lớn — gate tự làm mới khi bản thảo thay đổi",
      ],
    },
    {
      id: "defense",
      heading: "10 · Chế độ bảo vệ (mock viva)",
      paragraphs: [
        "Từ toolbar editor hoặc menu thẻ dự án, mở Bảo vệ để luyện viva với persona hội đồng của Ario.",
        "PDF bài báo hiển thị cạnh chat; link trích dẫn trong câu trả lời có thể cuộn và highlight PDF.",
      ],
      bullets: [
        "Proactive review — hội đồng đọc bài và hỏi với độ khó tăng dần",
        "Open Q&A — bạn nêu lo ngại; hội đồng đào sâu thêm",
        "Một câu hỏi mỗi lượt; khởi động lại phiên bất cứ lúc nào từ header panel",
        "Có thể có giới hạn lượt free — xem bộ đếm trên giao diện defense",
      ],
    },
    {
      id: "profile",
      heading: "11 · Hồ sơ & tùy chọn",
      paragraphs: [
        "Mở Hồ sơ từ sidebar workspace để đặt tên, đơn vị, lĩnh vực, LLM mặc định và mức integrity.",
        "Bật EN/VI và sáng/tối từ footer sidebar — ngôn ngữ áp dụng toàn app (marketing, auth, projects, editor).",
      ],
    },
    {
      id: "shortcuts",
      heading: "12 · Phím tắt & mẹo",
      paragraphs: [
        "Dùng các prompt mẫu trên để khám phá từng task AI an toàn. Mở Hướng dẫn bất cứ lúc nào từ header Projects.",
      ],
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
