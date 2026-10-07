import type { UiLanguage } from "@/lib/researcher-profile";

export type GuideDemoId =
  "projects" | "editor" | "chat" | "compile" | "defense" | "account" | "slash" | "tools" | "score";

export type GuideStep = {
  id: GuideDemoId;
  step: string;
  title: string;
  description: string;
  bullets?: string[];
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
  slashChrome: string;
  slashInput: string;
  slashMenuLogic: string;
  slashMenuLogicFull: string;
  slashMenuEdit: string;
  toolsChrome: string;
  toolsTabInfo: string;
  toolsTabStructure: string;
  toolsTabLogic: string;
  toolsTabCitations: string;
  toolsTabVersions: string;
  toolsAutoCompile: string;
  scoreChrome: string;
  scoreOverall: string;
  scoreStructure: string;
  scoreLogic: string;
  scoreCitations: string;
  scorePeerReview: string;
};

export type GuideSection = {
  title: string;
  lede: string;
  steps: GuideStep[];
};

export type GuidePageContent = {
  title: string;
  lede: string;
  demo: GuideDemoLabels;
  intro: GuideSection;
  editor: GuideSection;
  onboarding: {
    title: string;
    lede: string;
    stepOf: (current: number, total: number) => string;
    prev: string;
    next: string;
    done: string;
    skip: string;
    fullGuide: string;
  };
  cta: string;
};

const EN: GuidePageContent = {
  title: "User Guide",
  lede: "Start with the six-step tour, then dive into slash commands, Tools, compile, scoring, and defense rehearsal.",
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
    slashChrome: "Nib chat · slash commands",
    slashInput: "/logic",
    slashMenuLogic: "/logic — quick claim–evidence scan",
    slashMenuLogicFull: "/logic full — full manuscript scan",
    slashMenuEdit: "/edit — change a section",
    toolsChrome: "Tools panel",
    toolsTabInfo: "Info",
    toolsTabStructure: "Structure",
    toolsTabLogic: "Logic",
    toolsTabCitations: "Citations",
    toolsTabVersions: "Versions",
    toolsAutoCompile: "Auto-compile on save",
    scoreChrome: "Publication readiness",
    scoreOverall: "Overall",
    scoreStructure: "Structure",
    scoreLogic: "Logic",
    scoreCitations: "Citations",
    scorePeerReview: "Peer review",
  },
  intro: {
    title: "Getting started",
    lede: "Six steps to use Proofline — Projects, the editor desk, and the workspace sidebar.",
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
          "Left — file tree and outline. Center — LaTeX source with undo/redo. Right — PDF preview after Compile. Nib chat sits in the bottom-right dock.",
      },
      {
        id: "chat",
        step: "03",
        title: "Chat with Nib · Accept or Refuse",
        description:
          "Ask Nib to polish style, check citations, or review logic. Style edits show as a diff — nothing is saved until you Accept. Refuse to dismiss.",
      },
      {
        id: "compile",
        step: "04",
        title: "Compile PDF & export",
        description:
          "Click Compile in the toolbar to build a PDF preview. Export opens the publication-readiness score and PDF download.",
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
  },
  editor: {
    title: "Editor in depth",
    lede: "Slash commands, the Tools drawer, compile workflow, publication score, and the defense council agent.",
    steps: [
      {
        id: "slash",
        step: "01",
        title: "Slash commands in chat",
        description:
          "In the Nib chat box, type / to open the command palette. Pick a command or keep typing to filter — e.g. /logic full, /edit shorten the abstract.",
        bullets: [
          "/logic — quick claim–evidence scan on 2–3 IMRAD sections (Gemini 2.5 Flash)",
          "/logic full — full manuscript scan (Gemini 3.5 Flash, up to 20 sections, Tools → Logic)",
          "/structure — IMRAD outline check; results also appear in Tools → Structure",
          "/citation — match \\cite{...} keys to your bibliography",
          "/edit <instruction> — targeted rewrite; highlight LaTeX first to scope the edit",
          "/chat — Q&A only; does not modify the manuscript",
        ],
      },
      {
        id: "tools",
        step: "02",
        title: "Tools panel",
        description:
          "Open Tools from the editor toolbar (wrench icon). Five tabs keep project stats, structure hints, logic audit, citations, and AI revision history in one place.",
        bullets: [
          "Info — word/figure/math counts, auto-compile toggle, link to researcher profile",
          "Structure — missing or reordered IMRAD sections; jump to source or ask Nib to fix",
          "Logic — run Quick audit, track progress, jump to flagged lines, ask Nib per issue",
          "Citations — verify keys against metadata; fix one key or ask Nib to fix all gaps",
          "Versions — accepted/refused AI edits with diff stats and timestamps",
        ],
      },
      {
        id: "compile",
        step: "03",
        title: "Compile & PDF preview",
        description:
          "Compile builds your manuscript on the server (TeX Live). The PDF panel updates when the build succeeds; enable auto-compile in Tools → Info to rebuild after each save.",
        bullets: [
          "Toolbar Compile — full PDF build; status and log appear in the preview header",
          "SyncTeX — double-click a word in the PDF to jump to the matching LaTeX line",
          "Compiler auto-detect — pdflatex / xelatex / lualatex from your preamble",
          "Find in PDF — search text inside the preview panel",
          "Export — download PDF; if no fresh build exists you are prompted to compile first",
        ],
      },
      {
        id: "score",
        step: "04",
        title: "Publication readiness score",
        description:
          "Export or the Score button opens a gate that scores your manuscript before download. An agent skim may run when enabled — wait for the audit animation to finish.",
        bullets: [
          "Overall ring — 0–100 with grade band (green / amber / red)",
          "Structure — IMRAD completeness and section fill",
          "Logic — uses your latest logic audit when available",
          "Citations — verified vs missing bibliography keys",
          "Peer review — optional agent dimension when audit completes",
          "Placeholder/template manuscripts score low until real research content replaces sample text",
        ],
      },
      {
        id: "defense",
        step: "05",
        title: "Defense council agent",
        description:
          "Defense opens a split view: council chat on one side, your compiled paper PDF on the other. The agent plays examiners — ask follow-ups, cite passages, or restart the session.",
        bullets: [
          "Start session — proactive opening questions from the council, or type your own",
          "PDF sync — Refresh paper pulls the latest compile from the editor",
          "Turn quota — Free and Pro plans have daily limits; timer shows next reset",
          "Stop / send — interrupt a long reply or continue the dialogue",
          "Resume — return to a previous defense thread or start fresh",
          "Mobile — switch between Council and PDF tabs",
        ],
      },
    ],
  },
  onboarding: {
    title: "Editor tour",
    lede: "Five quick steps for slash commands, Tools, compile, scoring, and defense rehearsal.",
    stepOf: (current, total) => `Step ${current} of ${total}`,
    prev: "Back",
    next: "Next",
    done: "Start editing",
    skip: "Skip tour",
    fullGuide: "Open full guide",
  },
  cta: "Go to your projects",
};

const VI: GuidePageContent = {
  title: "Hướng dẫn sử dụng",
  lede: "Bắt đầu với tour sáu bước, sau đó đi sâu lệnh slash, Tools, biên dịch, chấm điểm và luyện phản biện.",
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
    slashChrome: "Chat Nib · lệnh slash",
    slashInput: "/logic",
    slashMenuLogic: "/logic — quét nhanh claim–evidence",
    slashMenuLogicFull: "/logic full — quét toàn bộ bài",
    slashMenuEdit: "/edit — sửa một phần cụ thể",
    toolsChrome: "Panel Tools",
    toolsTabInfo: "Thông tin",
    toolsTabStructure: "Cấu trúc",
    toolsTabLogic: "Logic",
    toolsTabCitations: "Trích dẫn",
    toolsTabVersions: "Phiên bản",
    toolsAutoCompile: "Tự biên dịch khi lưu",
    scoreChrome: "Sẵn sàng xuất bản",
    scoreOverall: "Tổng",
    scoreStructure: "Cấu trúc",
    scoreLogic: "Logic",
    scoreCitations: "Trích dẫn",
    scorePeerReview: "Phản biện",
  },
  intro: {
    title: "Bắt đầu",
    lede: "Sáu bước dùng Proofline — Dự án, bàn editor và sidebar workspace.",
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
          "Trái — cây file và outline. Giữa — nguồn LaTeX với undo/redo. Phải — xem trước PDF sau Biên dịch. Chat Nib ở góc dưới-phải.",
      },
      {
        id: "chat",
        step: "03",
        title: "Chat Nib · Accept hoặc Refuse",
        description:
          "Nhờ Nib chỉnh văn phong, kiểm tra trích dẫn hoặc logic. Style edit hiện diff — chỉ lưu khi bạn Accept. Refuse để bỏ qua.",
      },
      {
        id: "compile",
        step: "04",
        title: "Biên dịch PDF & xuất bản",
        description:
          "Nhấn Biên dịch trên toolbar để tạo PDF. Xuất mở điểm sẵn sàng xuất bản và tải PDF.",
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
  },
  editor: {
    title: "Editor chi tiết",
    lede: "Lệnh slash, drawer Tools, quy trình biên dịch, chấm điểm xuất bản và agent hội đồng phản biện.",
    steps: [
      {
        id: "slash",
        step: "01",
        title: "Lệnh nhanh slash (/) trong chat",
        description:
          "Trong ô chat Nib, gõ / để mở bảng lệnh. Chọn lệnh hoặc gõ tiếp để lọc — ví dụ /logic full, /edit rút gọn abstract.",
        bullets: [
          "/logic — quét nhanh claim–evidence 2–3 phần IMRAD (Gemini 2.5 Flash)",
          "/logic full — quét toàn bộ bài (Gemini 3.5 Flash, tối đa 20 section, Tools → Logic)",
          "/structure — kiểm tra outline IMRAD; kết quả cũng ở Tools → Cấu trúc",
          "/citation — đối chiếu \\cite{...} với bibliography",
          "/edit <yêu cầu> — sửa có mục tiêu; bôi đen LaTeX trước để giới hạn vùng sửa",
          "/chat — hỏi đáp thuần; không tự sửa bản thảo",
        ],
      },
      {
        id: "tools",
        step: "02",
        title: "Panel Tools",
        description:
          "Mở Tools trên toolbar editor (icon cờ lê). Năm tab gom thống kê dự án, gợi ý cấu trúc, logic audit, trích dẫn và lịch sử chỉnh sửa AI.",
        bullets: [
          "Thông tin — đếm từ/hình/công thức, bật tự biên dịch, link hồ sơ researcher",
          "Cấu trúc — section IMRAD thiếu/sai thứ tự; nhảy tới nguồn hoặc nhờ Nib sửa",
          "Logic — chạy Quick audit, theo dõi tiến độ, nhảy tới dòng lỗi, hỏi Nib từng issue",
          "Trích dẫn — xác minh key với metadata; sửa từng key hoặc nhờ Nib sửa hết",
          "Phiên bản — các edit AI đã Accept/Refuse kèm diff và thời gian",
        ],
      },
      {
        id: "compile",
        step: "03",
        title: "Biên dịch & xem PDF",
        description:
          "Biên dịch build bản thảo trên server (TeX Live). Panel PDF cập nhật khi build thành công; bật tự biên dịch ở Tools → Thông tin để rebuild sau mỗi lần lưu.",
        bullets: [
          "Biên dịch trên toolbar — build PDF đầy đủ; trạng thái và log ở header preview",
          "SyncTeX — double-click từ trong PDF để nhảy tới dòng LaTeX tương ứng",
          "Tự nhận compiler — pdflatex / xelatex / lualatex từ preamble",
          "Tìm trong PDF — search nội dung trong panel preview",
          "Xuất — tải PDF; nếu chưa build mới sẽ được nhắc biên dịch trước",
        ],
      },
      {
        id: "score",
        step: "04",
        title: "Chấm điểm sẵn sàng xuất bản",
        description:
          "Xuất hoặc nút Điểm mở cổng chấm điểm trước khi tải. Agent skim có thể chạy khi bật — đợi animation audit hoàn tất.",
        bullets: [
          "Vòng tổng — 0–100 với mức màu (xanh / vàng / đỏ)",
          "Cấu trúc — độ đủ IMRAD và mức độ hoàn thiện section",
          "Logic — dùng logic audit mới nhất nếu có",
          "Trích dẫn — key đã xác minh vs thiếu trong bibliography",
          "Phản biện — chiều agent tùy chọn khi audit xong",
          "Bản mẫu/placeholder điểm thấp cho đến khi thay bằng nội dung nghiên cứu thật",
        ],
      },
      {
        id: "defense",
        step: "05",
        title: "Agent hội đồng phản biện",
        description:
          "Bảo vệ mở giao diện chia đôi: chat hội đồng một bên, PDF bài đã biên dịch bên kia. Agent đóng vai giám khảo — hỏi tiếp, trích đoạn, hoặc bắt đầu lại phiên.",
        bullets: [
          "Bắt đầu phiên — câu hỏi mở đầu chủ động từ hội đồng, hoặc tự nhập",
          "Đồng bộ PDF — Làm mới bài kéo bản compile mới nhất từ editor",
          "Quota lượt — gói Free/Pro có giới hạn ngày; đồng hồ hiện lúc reset",
          "Dừng / gửi — ngắt câu trả lời dài hoặc tiếp tục hội thoại",
          "Tiếp tục — quay lại thread cũ hoặc phiên mới",
          "Mobile — chuyển tab Hội đồng và PDF",
        ],
      },
    ],
  },
  onboarding: {
    title: "Tour editor",
    lede: "Năm bước nhanh về lệnh slash, Tools, biên dịch, chấm điểm và luyện phản biện.",
    stepOf: (current, total) => `Bước ${current} / ${total}`,
    prev: "Quay lại",
    next: "Tiếp",
    done: "Bắt đầu biên tập",
    skip: "Bỏ qua",
    fullGuide: "Mở hướng dẫn đầy đủ",
  },
  cta: "Đến dự án của bạn",
};

export function guideCopy(lang: UiLanguage): GuidePageContent {
  return lang === "vi" ? VI : EN;
}
