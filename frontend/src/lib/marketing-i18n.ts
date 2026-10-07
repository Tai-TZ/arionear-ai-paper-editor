import type { UiLanguage } from "@/lib/researcher-profile";

export type HeroSuggestionCopy = {
  id: "style" | "citation" | "logic";
  label: string;
  text: string;
  statusHint: string;
  acceptHint: string;
  refuseHint: string;
};

type MarketingCopy = {
  plans: {
    sectionLabel: string;
    sectionTitle: string;
    sectionLink: string;
    footnote: string;
    currentPlanCta: string;
    upgrading: string;
    quotaLabel: string;
    quotaPeriodDaily: string;
    quotaFull: string;
    checkoutUnavailable: string;
    free: {
      tier: string;
      price: string;
      priceSub: string;
      tagline: string;
      cta: string;
      features: string[];
      locked: string[];
    };
    pro: {
      tier: string;
      badge: string;
      price: string;
      priceSub: string;
      tagline: string;
      cta: string;
      features: string[];
    };
  };
  hero: {
    breaking: string;
    deskEdition: string;
    headline: string;
    headlineEm: string;
    headlineEnd: string;
    lede: string;
    fromEditor: string;
    editorQuote: string;
    editorByline: string;
    uploadLatex: string;
    seeWorkflow: string;
    figCaption: string;
    figNote: string;
    stats: { k: string; v: string }[];
  };
  features: {
    sectionTitle: string;
    sectionLink: string;
    items: { title: string; body: string }[];
  };
  workflow: {
    sectionTitle: string;
    sectionLink: string;
    fullLink: string;
    steps: { n: string; t: string; b: string }[];
    stepLabel: string;
  };
  integrity: {
    policyLabel: string;
    titleLine1: string;
    titleLine2: string;
    titleEm: string;
    titleLine3: string;
    body: string;
    readPolicy: string;
    guaranteesLabel: string;
    sectionRef: string;
    items: { n: string; title: string; body: string }[];
  };
  heroDemo: {
    ariaLabel: string;
    deskSession: string;
    liveDemo: string;
    pausedInteractive: string;
    pauseDemo: string;
    playDemo: string;
    pause: string;
    play: string;
    nibRole: string;
    aiEditor: string;
    thinking: string;
    proof: string;
    accept: string;
    refuse: string;
    sessionComplete: string;
    loopHint: string;
    replayDemo: string;
    suggestions: HeroSuggestionCopy[];
  };
};

const EN: MarketingCopy = {
  plans: {
    sectionLabel: "Subscription Plans",
    sectionTitle: "Choose Your Plan",
    sectionLink: "Section C · Pricing →",
    footnote: "No credit card required for Free · Cancel Pro anytime · 256-bit SSL",
    currentPlanCta: "Your current plan",
    upgrading: "Processing…",
    quotaLabel: "Defense turns used",
    quotaPeriodDaily: "today",
    quotaFull: "You've used all your turns. Upgrade to Pro for 50 turns per day.",
    checkoutUnavailable:
      "Online payment isn't available yet. Please contact an administrator to upgrade to Pro.",
    free: {
      tier: "FREE",
      price: "Free",
      priceSub: "forever",
      tagline: "Start editing immediately",
      cta: "Open the Desk →",
      features: [
        "5 Defense Rehearsal turns / day",
        "Unlimited LaTeX AI editing",
        "Academic template gallery",
      ],
      locked: ["50 Defense turns / day", "Priority AI model", "Export without watermark"],
    },
    pro: {
      tier: "PRO",
      badge: "Most Popular",
      price: "$2",
      priceSub: "/ month",
      tagline: "For the serious researcher",
      cta: "Upgrade Now →",
      features: [
        "50 Defense Rehearsal turns / day",
        "Unlimited LaTeX AI editing",
        "Academic template gallery",
        "Priority AI model",
        "Export without watermark",
      ],
    },
  },
  hero: {
    breaking: "Breaking",
    deskEdition: "Manuscript Desk · LaTeX Edition",
    headline: "Research ",
    headlineEm: "Deserves",
    headlineEnd: " a Fair Reading.",
    lede: "Publishing quality international research is a major barrier — especially for non-native English speakers. Proofline is an AI academic editor for LaTeX: improve prose and grammar while preserving meaning, suggest structure, check citations — never fabricate content or results.",
    fromEditor: "From the Editor",
    editorQuote:
      '"Good research is rejected for how it reads — not for its scientific merit. We help your work be read at its true value."',
    editorByline: "— The Proofline Desk",
    uploadLatex: "Upload LaTeX",
    seeWorkflow: "See the Workflow",
    figCaption: "Fig. 1.1",
    figNote: "Interactive desk session — click suggestions, Accept or Refuse. Demo only, no API.",
    stats: [
      { k: "LaTeX", v: "Upload & edit" },
      { k: "PDF", v: "Compile preview" },
      { k: "0", v: "Fabricated citations" },
    ],
  },
  features: {
    sectionTitle: "The Editorial Desk",
    sectionLink: "Section A · Features →",
    items: [
      {
        title: "Academic Voice",
        body: "Improve academic prose and English grammar while preserving the author's original meaning and argument.",
      },
      {
        title: "Structure Guide",
        body: "Suggestions for Abstract, Introduction, Methods, Results, Discussion aligned with international journal standards.",
      },
      {
        title: "Logic & Consistency",
        body: "Check consistency and argument logic across sections — surface contradictions and gaps.",
      },
      {
        title: "Citation Format",
        body: "Support APA, IEEE, Vancouver, BibTeX formatting — with warnings for unverifiable sources.",
      },
      {
        title: "Integrity Guard",
        body: "Academic guardrails: expression support, never fabricate data, results, or citations.",
      },
    ],
  },
  workflow: {
    sectionTitle: "How the Press Runs",
    sectionLink: "Full workflow →",
    fullLink: "Read the full workflow",
    stepLabel: "Step",
    steps: [
      {
        n: "01",
        t: "Upload LaTeX",
        b: "Import a `.tex` file and figure assets, or start from a blank or sample project.",
      },
      {
        n: "02",
        t: "Read the Markup",
        b: "Chat with Nib. Suggestions appear as tracked changes with rationale.",
      },
      {
        n: "03",
        t: "Accept or Refuse",
        b: "You remain the author. Nothing reaches your manuscript without consent.",
      },
      {
        n: "04",
        t: "Compile PDF",
        b: "Preview the compiled PDF in the editor and save your LaTeX source.",
      },
    ],
  },
  integrity: {
    policyLabel: "Editorial Policy",
    titleLine1: "AI is the editor.",
    titleLine2: "",
    titleEm: "You",
    titleLine3: " are the author.",
    body: "Proofline treats your manuscript the way a thoughtful editor would — improving how the work is presented without altering what the work claims. The system is hard-wired to refuse fabrication.",
    readPolicy: "Read editorial policy →",
    guaranteesLabel: "Five Guarantees",
    sectionRef: "§ 01–05",
    items: [
      {
        n: "01",
        title: "No Fabrication",
        body: "AI never invents data, results, or measurements.",
      },
      {
        n: "02",
        title: "Verified Citations",
        body: "Every reference is verified against the manuscript and the source.",
      },
      {
        n: "03",
        title: "Meaning Preserved",
        body: "Edits preserve the author's argument and scientific meaning.",
      },
      {
        n: "04",
        title: "Full Control",
        body: "All suggestions are reviewable, dismissible, and auditable.",
      },
      {
        n: "05",
        title: "Your Data Stays Yours",
        body: "Manuscript content is never used to train external models.",
      },
    ],
  },
  heroDemo: {
    ariaLabel: "Interactive editorial desk demo — mock session, no real AI",
    deskSession: "Desk Session",
    liveDemo: "Live demo",
    pausedInteractive: "Paused · interactive",
    pauseDemo: "Pause demo",
    playDemo: "Play demo",
    pause: "Pause",
    play: "Play",
    nibRole: "Nib",
    aiEditor: "AI editor",
    thinking: "thinking…",
    proof: "Proof",
    accept: "Accept",
    refuse: "Refuse",
    sessionComplete: "Session complete — restarting walkthrough…",
    loopHint: "Loops automatically · click to interact",
    replayDemo: "Replay demo",
    suggestions: [
      {
        id: "style",
        label: "Style",
        text: "Fix subject–verb agreement in the opening sentence.",
        statusHint: "Nib marks a grammar fix on the proof.",
        acceptHint: "Author accepts — sentence updated in main.tex.",
        refuseHint: "Suggestion dismissed — original wording kept.",
      },
      {
        id: "citation",
        label: "Citation",
        text: "Cross-check DOI for \\cite{author2024}.",
        statusHint: "Citation layer flags an unverified reference.",
        acceptHint: "Reference marked verified (demo).",
        refuseHint: "Citation flag dismissed for now.",
      },
      {
        id: "logic",
        label: "Logic",
        text: "Methods section references missing figure.",
        statusHint: "Logic check notes a missing figure call-out.",
        acceptHint: "Flag acknowledged — author will revise offline.",
        refuseHint: "Logic note dismissed.",
      },
    ],
  },
};

const VI: MarketingCopy = {
  plans: {
    sectionLabel: "Gói Dịch Vụ",
    sectionTitle: "Chọn Gói Phù Hợp",
    sectionLink: "Mục C · Bảng giá →",
    footnote: "Không cần thẻ tín dụng cho Free · Huỷ Pro bất cứ lúc nào · Bảo mật SSL 256-bit",
    currentPlanCta: "Gói hiện tại của bạn",
    upgrading: "Đang xử lý…",
    quotaLabel: "Lượt phản biện đã dùng",
    quotaPeriodDaily: "hôm nay",
    quotaFull: "Bạn đã hết lượt. Nâng cấp Pro để có thêm 50 lượt phản biện mỗi ngày.",
    checkoutUnavailable:
      "Thanh toán trực tuyến chưa được kích hoạt. Vui lòng liên hệ quản trị viên để nâng cấp Pro.",
    free: {
      tier: "MIỄN PHÍ",
      price: "Free",
      priceSub: "mãi mãi",
      tagline: "Bắt đầu biên tập ngay lập tức",
      cta: "Mở bàn biên tập →",
      features: [
        "5 lượt phản biện / ngày",
        "Biên tập LaTeX AI không giới hạn",
        "Thư viện template học thuật",
      ],
      locked: [
        "50 lượt phản biện / ngày",
        "Ưu tiên model AI tốc độ cao",
        "Xuất PDF không watermark",
      ],
    },
    pro: {
      tier: "PRO",
      badge: "Phổ biến nhất",
      price: "49.000 ₫",
      priceSub: "/ tháng",
      tagline: "Dành cho nhà nghiên cứu nghiêm túc",
      cta: "Nâng cấp ngay →",
      features: [
        "50 lượt phản biện / ngày",
        "Biên tập LaTeX AI không giới hạn",
        "Thư viện template học thuật",
        "Ưu tiên model AI tốc độ cao",
        "Xuất PDF không watermark",
      ],
    },
  },
  hero: {
    breaking: "Tin nóng",
    deskEdition: "Bản Thảo · Phiên bản LaTeX",
    headline: "Nghiên cứu ",
    headlineEm: "Xứng đáng",
    headlineEnd: " được đọc công bằng.",
    lede: "Viết bài báo khoa học chất lượng quốc tế là rào cản lớn — đặc biệt với nhà nghiên cứu không phải người bản ngữ tiếng Anh. Proofline là trợ lý AI biên tập học thuật cho LaTeX: cải thiện văn phong và ngữ pháp giữ đúng ý gốc, gợi ý cấu trúc, kiểm tra trích dẫn — không bao giờ bịa nội dung hay kết quả.",
    fromEditor: "Từ Ban biên tập",
    editorQuote:
      '"Nghiên cứu tốt bị từ chối vì cách trình bày — không phải vì chất lượng khoa học. Chúng tôi giúp công trình của bạn được đọc đúng giá trị."',
    editorByline: "— Ban biên tập Proofline",
    uploadLatex: "Tải LaTeX",
    seeWorkflow: "Xem quy trình",
    figCaption: "Hình 1.1",
    figNote:
      "Phiên biên tập tương tác — bấm gợi ý, Chấp nhận hoặc Từ chối. Chỉ demo, không gọi API.",
    stats: [
      { k: "LaTeX", v: "Tải & chỉnh sửa" },
      { k: "PDF", v: "Xem trước biên dịch" },
      { k: "0", v: "Trích dẫn bịa đặt" },
    ],
  },
  features: {
    sectionTitle: "Ban Biên Tập",
    sectionLink: "Mục A · Tính năng →",
    items: [
      {
        title: "Giọng văn học thuật",
        body: "Cải thiện văn phong học thuật và ngữ pháp tiếng Anh, giữ nguyên ý nghĩa và lập luận gốc của tác giả.",
      },
      {
        title: "Hướng dẫn cấu trúc",
        body: "Gợi ý cấu trúc Abstract, Introduction, Methods, Results, Discussion theo chuẩn tạp chí quốc tế.",
      },
      {
        title: "Logic & Nhất quán",
        body: "Kiểm tra tính nhất quán và logic lập luận xuyên suốt các phần — phát hiện mâu thuẫn và lỗ hổng.",
      },
      {
        title: "Định dạng trích dẫn",
        body: "Hỗ trợ định dạng trích dẫn APA, IEEE, Vancouver, BibTeX — và cảnh báo nguồn không xác minh được.",
      },
      {
        title: "Integrity Guard",
        body: "Guardrail học thuật: hỗ trợ diễn đạt, tuyệt đối không bịa dữ liệu, kết quả hay trích dẫn.",
      },
    ],
  },
  workflow: {
    sectionTitle: "Quy trình vận hành",
    sectionLink: "Quy trình đầy đủ →",
    fullLink: "Đọc quy trình đầy đủ",
    stepLabel: "Bước",
    steps: [
      {
        n: "01",
        t: "Tải LaTeX",
        b: "Nhập file `.tex` và hình minh họa, hoặc bắt đầu từ dự án trống hoặc mẫu.",
      },
      {
        n: "02",
        t: "Đọc markup",
        b: "Trò chuyện với Nib. Gợi ý hiện dạng tracked changes kèm lý do.",
      },
      {
        n: "03",
        t: "Chấp nhận hoặc Từ chối",
        b: "Bạn vẫn là tác giả. Không gì vào bản thảo nếu bạn chưa đồng ý.",
      },
      {
        n: "04",
        t: "Biên dịch PDF",
        b: "Xem trước PDF đã biên dịch trong trình biên tập và lưu nguồn LaTeX.",
      },
    ],
  },
  integrity: {
    policyLabel: "Chính sách biên tập",
    titleLine1: "AI là biên tập viên.",
    titleLine2: "",
    titleEm: "Bạn",
    titleLine3: " là tác giả.",
    body: "Proofline xử lý bản thảo như một biên tập viên cẩn trọng — cải thiện cách trình bày mà không thay đổi nội dung khoa học. Hệ thống được thiết kế để từ chối mọi hành vi bịa đặt.",
    readPolicy: "Đọc chính sách biên tập →",
    guaranteesLabel: "Năm cam kết",
    sectionRef: "§ 01–05",
    items: [
      {
        n: "01",
        title: "Không bịa đặt",
        body: "AI không bao giờ bịa dữ liệu, kết quả hay số liệu.",
      },
      {
        n: "02",
        title: "Trích dẫn xác minh",
        body: "Mọi tài liệu tham khảo được đối chiếu với bản thảo và nguồn gốc.",
      },
      {
        n: "03",
        title: "Giữ nguyên ý nghĩa",
        body: "Chỉnh sửa bảo toàn lập luận và ý nghĩa khoa học của tác giả.",
      },
      { n: "04", title: "Kiểm soát đầy đủ", body: "Mọi gợi ý có thể xem lại, bỏ qua và kiểm tra." },
      {
        n: "05",
        title: "Dữ liệu thuộc về bạn",
        body: "Nội dung bản thảo không dùng để huấn luyện mô hình bên ngoài.",
      },
    ],
  },
  heroDemo: {
    ariaLabel: "Demo biên tập tương tác — phiên giả lập, không có AI thật",
    deskSession: "Phiên biên tập",
    liveDemo: "Demo trực tiếp",
    pausedInteractive: "Tạm dừng · tương tác",
    pauseDemo: "Tạm dừng demo",
    playDemo: "Phát demo",
    pause: "Tạm dừng",
    play: "Phát",
    nibRole: "Nib",
    aiEditor: "Biên tập AI",
    thinking: "đang suy nghĩ…",
    proof: "Bản in",
    accept: "Chấp nhận",
    refuse: "Từ chối",
    sessionComplete: "Hoàn tất phiên — khởi động lại…",
    loopHint: "Tự lặp · bấm để tương tác",
    replayDemo: "Phát lại demo",
    suggestions: [
      {
        id: "style",
        label: "Văn phong",
        text: "Sửa hòa hợp chủ ngữ–động từ trong câu mở đầu.",
        statusHint: "Nib đánh dấu sửa ngữ pháp trên bản in.",
        acceptHint: "Tác giả chấp nhận — câu cập nhật trong main.tex.",
        refuseHint: "Gợi ý bị bỏ — giữ nguyên câu gốc.",
      },
      {
        id: "citation",
        label: "Trích dẫn",
        text: "Đối chiếu DOI cho \\cite{author2024}.",
        statusHint: "Lớp trích dẫn cảnh báo nguồn chưa xác minh.",
        acceptHint: "Đánh dấu đã xác minh (demo).",
        refuseHint: "Bỏ qua cảnh báo trích dẫn tạm thời.",
      },
      {
        id: "logic",
        label: "Logic",
        text: "Phần Methods tham chiếu hình thiếu.",
        statusHint: "Kiểm tra logic ghi nhận thiếu tham chiếu hình.",
        acceptHint: "Đã ghi nhận — tác giả sẽ sửa offline.",
        refuseHint: "Ghi chú logic bị bỏ qua.",
      },
    ],
  },
};

export function marketingCopy(lang: UiLanguage): MarketingCopy {
  return lang === "vi" ? VI : EN;
}
