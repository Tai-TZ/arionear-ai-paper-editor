import type { MarketingPageContent } from "@/lib/marketing-content";
import {
  aboutContent,
  contactContent,
  dataUseContent,
  ethicsContent,
  featuresContent,
  integrityContent,
  latexGuideContent,
  privacyContent,
  termsContent,
  workflowContent,
} from "@/lib/marketing-content";
import type { UiLanguage } from "@/lib/researcher-profile";

export type MarketingPageSlug =
  | "workflow"
  | "features"
  | "integrity"
  | "latex-guide"
  | "about"
  | "contact"
  | "terms"
  | "privacy"
  | "ethics"
  | "data-use";

const EN_PAGES: Record<MarketingPageSlug, MarketingPageContent> = {
  workflow: workflowContent,
  features: featuresContent,
  integrity: integrityContent,
  "latex-guide": latexGuideContent,
  about: aboutContent,
  contact: contactContent,
  terms: termsContent,
  privacy: privacyContent,
  ethics: ethicsContent,
  "data-use": dataUseContent,
};

const VI_PAGES: Record<MarketingPageSlug, MarketingPageContent> = {
  workflow: {
    slug: "workflow",
    title: "Quy trình vận hành",
    eyebrow: "Mục B · Quy trình",
    lede: "Proofline Giai đoạn 1 tập trung vào bản thảo LaTeX. Tải nguồn `.tex`, cộng tác với Nib trong trình biên tập, và giữ toàn quyền kiểm soát mọi thay đổi.",
    sections: [
      {
        heading: "Bước 01 · Tải LaTeX",
        paragraphs: [
          "Tạo dự án trống, bắt đầu từ mẫu có sẵn, hoặc tải file `.tex` cùng hình minh họa (`.png`, `.pdf`, `.eps`, …).",
          "Nhập DOCX và PDF chưa có trong MVP hiện tại.",
        ],
      },
      {
        heading: "Bước 02 · Đọc markup",
        paragraphs: [
          "Trò chuyện với Nib để cải thiện văn phong, cấu trúc hoặc trích dẫn. Gợi ý hiện dạng tracked changes kèm lý do rõ ràng.",
        ],
      },
      {
        heading: "Bước 03 · Chấp nhận hoặc Từ chối",
        paragraphs: [
          "Bạn vẫn là tác giả. Duyệt, sửa hoặc bỏ qua từng gợi ý. Không gì vào bản thảo nếu bạn chưa đồng ý.",
        ],
      },
      {
        heading: "Bước 04 · Biên dịch & Xuất",
        paragraphs: [
          "Biên dịch bản thảo sang PDF trong trình biên tập, xem trước và lưu nguồn LaTeX về tài khoản của bạn.",
        ],
      },
    ],
  },
  features: {
    slug: "features",
    title: "Ban Biên Tập",
    eyebrow: "Mục A · Tính năng",
    lede: "Công cụ giúp nhà nghiên cứu trình bày khoa học mạnh một cách rõ ràng — không bịa dữ liệu hay kết quả.",
    sections: [
      {
        heading: "Giọng văn học thuật",
        paragraphs: [
          "Cải thiện tiếng Anh học thuật, giữ nguyên ý nghĩa và lập luận gốc của tác giả.",
        ],
      },
      {
        heading: "Hướng dẫn cấu trúc",
        paragraphs: [
          "Gợi ý các phần IMRAD — abstract, introduction, methods, results và discussion.",
        ],
      },
      {
        heading: "Định dạng trích dẫn",
        paragraphs: [
          "Đối chiếu trích dẫn với nguồn bên ngoài và giữ khóa BibTeX nhất quán với bản thảo.",
        ],
      },
      {
        heading: "Integrity Guard",
        paragraphs: [
          "Guardrail chặn lệch số liệu và khẳng định không có căn cứ. Mọi chỉnh sửa đều xem lại trước khi vào bản thảo.",
        ],
      },
    ],
  },
  integrity: {
    slug: "integrity",
    title: "AI là biên tập viên. Bạn là tác\u00A0giả.",
    eyebrow: "Chính sách biên tập",
    lede: "Proofline cải thiện cách trình bày — không thay đổi nội dung khoa học cốt lõi.",
    sections: [
      {
        paragraphs: [],
        bullets: [
          "AI không bao giờ bịa dữ liệu, kết quả hay số liệu.",
          "Mọi tài liệu tham khảo được đối chiếu với bản thảo và metadata có sẵn.",
          "Chỉnh sửa bảo toàn lập luận và ý nghĩa khoa học của tác giả.",
          "Mọi gợi ý có thể xem lại, bỏ qua và kiểm tra.",
          "Nội dung bản thảo không dùng để huấn luyện mô hình bên ngoài.",
        ],
      },
    ],
  },
  "latex-guide": {
    slug: "latex-guide",
    title: "Hướng dẫn LaTeX",
    eyebrow: "Tác giả · LaTeX",
    lede: "Mọi thứ bạn cần để bắt đầu với Proofline bằng file nguồn LaTeX.",
    sections: [
      {
        heading: "Đầu vào hỗ trợ",
        paragraphs: [
          "Tải file chính `.tex`. Bạn có thể đính kèm hình và file hỗ trợ trong cùng hộp thoại nhập.",
        ],
        bullets: [
          "Bản thảo chính: `.tex` hoặc `.latex`",
          "Hình: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.pdf`, `.eps`",
          "File hỗ trợ: `.cls`, `.bst`, `.sty`, `.bib`",
        ],
      },
      {
        heading: "Bắt đầu",
        paragraphs: [
          "Đăng nhập, mở Dự án của bạn, rồi chọn Dự án trống, Dự án mẫu hoặc Tải file LaTeX.",
          "Trình biên tập tự lưu công việc vào tài khoản khi bạn lưu hoặc rời phiên.",
        ],
      },
      {
        heading: "Xem trước biên dịch",
        paragraphs: [
          "Dùng Biên dịch trong trình biên tập để tạo xem trước PDF. Backend cần có TeX Live phía máy chủ.",
        ],
      },
    ],
  },
  about: {
    slug: "about",
    title: "Giới thiệu Proofline",
    eyebrow: "Văn phòng",
    lede: "Trợ lý AI biên tập dành cho nhà nghiên cứu cần một lần đọc công bằng — không phải viết lại khoa học của họ.",
    sections: [
      {
        paragraphs: [
          "Proofline giúp tác giả cải thiện ngôn ngữ, cấu trúc và trích dẫn trong khi giữ quyền kiểm soát cho con người.",
          "Proofline được thiết kế và phát triển bởi Nguyễn Thành Tài.",
        ],
      },
    ],
  },
  contact: {
    slug: "contact",
    title: "Liên hệ",
    eyebrow: "Văn phòng",
    lede: "Liên hệ ban biên tập để được hỗ trợ, hợp tác hoặc góp ý.",
    sections: [
      {
        paragraphs: [
          "Email: support@proofline.example",
          "Khi báo lỗi hoặc đề xuất tính năng, vui lòng mô tả các bước tái hiện và trình duyệt bạn đang dùng.",
        ],
      },
    ],
  },
  terms: {
    slug: "terms",
    title: "Điều khoản sử dụng",
    eyebrow: "Pháp lý",
    lede: "Khi dùng Proofline, bạn đồng ý sử dụng dịch vụ cho mục đích biên tập học thuật hợp pháp.",
    sections: [
      {
        paragraphs: [
          "Bạn giữ quyền sở hữu bản thảo. Proofline chỉ cung cấp gợi ý; bạn chịu trách nhiệm bản cuối cùng nộp đi.",
          "Không tải lên tài liệu mật hoặc kiểm soát xuất khẩu trừ khi bạn được phép.",
        ],
      },
    ],
  },
  privacy: {
    slug: "privacy",
    title: "Quyền riêng tư",
    eyebrow: "Pháp lý",
    lede: "Cách chúng tôi xử lý dữ liệu tài khoản và bản thảo trong MVP.",
    sections: [
      {
        paragraphs: [
          "Dữ liệu tài khoản (tên, email, đơn vị) được lưu trong cơ sở dữ liệu khi DATABASE_URL được cấu hình.",
          "Nguồn LaTeX bản thảo được lưu theo tài khoản. Đăng xuất xóa bộ nhớ cục bộ trên thiết bị của bạn.",
        ],
      },
    ],
  },
  ethics: {
    slug: "ethics",
    title: "Đạo đức",
    eyebrow: "Pháp lý",
    lede: "Nguyên tắc toàn vẹn học thuật chi phối Proofline.",
    sections: [
      {
        bullets: [
          "Tác giả phải xác minh mọi chỉnh sửa có AI trước khi nộp.",
          "Không dùng hệ thống để bịa dữ liệu, kết quả hay trích dẫn.",
          "Quyền tác giả và chính sách đơn vị vẫn là trách nhiệm của tác giả.",
        ],
        paragraphs: [],
      },
    ],
  },
  "data-use": {
    slug: "data-use",
    title: "Sử dụng dữ liệu",
    eyebrow: "Pháp lý",
    lede: "Điều gì xảy ra với bản thảo và dữ liệu trò chuyện của bạn.",
    sections: [
      {
        paragraphs: [
          "Nội dung bản thảo chỉ gửi tới nhà cung cấp LLM đã cấu hình để tạo gợi ý biên tập cho phiên của bạn.",
          "Chúng tôi không dùng bản thảo để huấn luyện mô hình công khai. Xem chính sách nhà cung cấp LLM về subprocessors.",
        ],
      },
    ],
  },
};

export type MarketingPageUiCopy = {
  backToHome: string;
  tryIt: string;
  learnMore: string;
  seeWorkflow: string;
  openEditor: string;
  stepLabel: string;
  authorGate: string;
};

export type FeaturesPageCopy = {
  figCaption: string;
  figNote: string;
  hubAria: string;
  hubCenterManuscript: string;
  hubCenterLatex: string;
  hubCenterSource: string;
  noLabel: string;
  features: { n: string; title: string; hubLabel: string; body: string; angle: number }[];
};

export type WorkflowPageCopy = {
  figCaption: string;
  figNote: string;
  steps: { n: string; title: string; detail: string }[];
  legend: { label: string; desc: string }[];
};

export type AboutPageCopy = {
  publishedBy: string;
  teamName: string;
  teamSubtitle: string;
  mastheadTitle: string;
  membersLabel: (count: number) => string;
  figCaption: string;
  illustrationAria: string;
  manuscriptLabel: string;
  liveDemo: string;
  paused: string;
  playDemo: string;
  pauseDemo: string;
  loopHint: string;
  editorRoles: string[];
};

const EN_UI: MarketingPageUiCopy = {
  backToHome: "← Back to home",
  tryIt: "Try it",
  learnMore: "Learn more",
  seeWorkflow: "See workflow",
  openEditor: "Open Editor",
  stepLabel: "Step",
  authorGate: "Author gate — no auto-apply",
};

const VI_UI: MarketingPageUiCopy = {
  backToHome: "← Về trang chủ",
  tryIt: "Dùng thử",
  learnMore: "Tìm hiểu thêm",
  seeWorkflow: "Xem quy trình",
  openEditor: "Mở Trình biên tập",
  stepLabel: "Bước",
  authorGate: "Cổng tác giả — không tự áp dụng",
};

const EN_FEATURES: FeaturesPageCopy = {
  figCaption: "Fig. 1.1 · Editorial Hub",
  figNote: "Five capabilities · One manuscript",
  hubAria:
    "Feature hub diagram showing five editorial capabilities around a central LaTeX manuscript",
  hubCenterManuscript: "MANUSCRIPT",
  hubCenterLatex: "LaTeX",
  hubCenterSource: ".tex source",
  noLabel: "No.",
  features: [
    {
      n: "01",
      title: "Academic Voice",
      hubLabel: "Voice",
      body: "Improve academic English while preserving meaning.",
      angle: 0,
    },
    {
      n: "02",
      title: "Structure Guide",
      hubLabel: "Structure",
      body: "IMRAD sections — abstract through discussion.",
      angle: 72,
    },
    {
      n: "03",
      title: "Logic & Consistency",
      hubLabel: "Logic",
      body: "Cross-section argument coherence checks.",
      angle: 144,
    },
    {
      n: "04",
      title: "Citation Format",
      hubLabel: "Citations",
      body: "APA, IEEE, Vancouver, BibTeX support.",
      angle: 216,
    },
    {
      n: "05",
      title: "Integrity Guard",
      hubLabel: "Integrity",
      body: "No fabricated data, results, or citations.",
      angle: 288,
    },
  ],
};

const VI_FEATURES: FeaturesPageCopy = {
  figCaption: "Hình 1.1 · Trung tâm biên tập",
  figNote: "Năm năng lực · Một bản thảo",
  hubAria: "Sơ đồ năm năng lực biên tập quanh bản thảo LaTeX trung tâm",
  hubCenterManuscript: "BẢN THẢO",
  hubCenterLatex: "LaTeX",
  hubCenterSource: "nguồn .tex",
  noLabel: "Số",
  features: [
    {
      n: "01",
      title: "Giọng văn học thuật",
      hubLabel: "Giọng",
      body: "Cải thiện tiếng Anh học thuật, giữ nguyên ý nghĩa.",
      angle: 0,
    },
    {
      n: "02",
      title: "Hướng dẫn cấu trúc",
      hubLabel: "Cấu trúc",
      body: "Các phần IMRAD — từ abstract đến discussion.",
      angle: 72,
    },
    {
      n: "03",
      title: "Logic & Nhất quán",
      hubLabel: "Logic",
      body: "Kiểm tra mạch lập luận xuyên suốt các phần.",
      angle: 144,
    },
    {
      n: "04",
      title: "Định dạng trích dẫn",
      hubLabel: "Trích dẫn",
      body: "Hỗ trợ APA, IEEE, Vancouver, BibTeX.",
      angle: 216,
    },
    {
      n: "05",
      title: "Integrity Guard",
      hubLabel: "Toàn vẹn",
      body: "Không bịa dữ liệu, kết quả hay trích dẫn.",
      angle: 288,
    },
  ],
};

const EN_WORKFLOW: WorkflowPageCopy = {
  figCaption: "Fig. 2.1 · Process Flow",
  figNote: "LaTeX MVP · Phase 1",
  steps: [
    { n: "01", title: "Upload LaTeX", detail: "Import `.tex` + figures, or start blank / sample" },
    { n: "02", title: "Chat with Nib", detail: "Style, structure & citation suggestions" },
    { n: "03", title: "Accept or Refuse", detail: "Tracked changes — you keep authorship" },
    { n: "04", title: "Compile PDF", detail: "Preview & save LaTeX to your account" },
  ],
  legend: [
    { label: "You remain the author", desc: "Every edit requires your approval" },
    { label: "Integrity guard", desc: "No fabricated data or citations" },
  ],
};

const VI_WORKFLOW: WorkflowPageCopy = {
  figCaption: "Hình 2.1 · Luồng quy trình",
  figNote: "LaTeX MVP · Giai đoạn 1",
  steps: [
    { n: "01", title: "Tải LaTeX", detail: "Nhập `.tex` + hình, hoặc bắt đầu trống / mẫu" },
    { n: "02", title: "Trò chuyện với Nib", detail: "Gợi ý văn phong, cấu trúc & trích dẫn" },
    { n: "03", title: "Chấp nhận hoặc Từ chối", detail: "Tracked changes — bạn giữ quyền tác giả" },
    { n: "04", title: "Biên dịch PDF", detail: "Xem trước & lưu LaTeX vào tài khoản" },
  ],
  legend: [
    { label: "Bạn vẫn là tác giả", desc: "Mọi chỉnh sửa cần sự đồng ý của bạn" },
    { label: "Integrity guard", desc: "Không bịa dữ liệu hay trích dẫn" },
  ],
};

const EN_ABOUT: AboutPageCopy = {
  publishedBy: "Published by",
  teamName: "Nguyễn Thành Tài",
  teamSubtitle: "Founder & Engineer · Closer to Publication",
  mastheadTitle: "The Masthead",
  membersLabel: (count) => `${count} ${count === 1 ? "member" : "members"}`,
  figCaption: "Fig. 3.1 — The Proofline editorial desk.",
  illustrationAria:
    "Interactive illustration of the Proofline editorial desk — three editors at a shared desk",
  manuscriptLabel: "LaTeX Manuscript",
  liveDemo: "Live",
  paused: "Paused · interactive",
  playDemo: "Play demo",
  pauseDemo: "Pause demo",
  loopHint: "Auto-cycles · click an editor to focus",
  editorRoles: ["Lead editor", "LaTeX desk", "Copy editor"],
};

const VI_ABOUT: AboutPageCopy = {
  publishedBy: "Xuất bản bởi",
  teamName: "Nguyễn Thành Tài",
  teamSubtitle: "Founder & Engineer · Closer to Publication",
  mastheadTitle: "Ban biên tập",
  membersLabel: (count) => `${count} thành viên`,
  figCaption: "Hình 3.1 — Bàn biên tập Proofline.",
  illustrationAria:
    "Minh họa tương tác bàn biên tập Proofline — ba biên tập viên tại bàn biên tập chung",
  manuscriptLabel: "Bản thảo LaTeX",
  liveDemo: "Trực tiếp",
  paused: "Tạm dừng · tương tác",
  playDemo: "Phát demo",
  pauseDemo: "Tạm dừng demo",
  loopHint: "Tự chuyển · bấm biên tập viên để chọn",
  editorRoles: ["Biên tập trưởng", "Bàn LaTeX", "Biên tập bản thảo"],
};

export function marketingPageContent(
  locale: UiLanguage,
  slug: MarketingPageSlug,
): MarketingPageContent {
  return locale === "vi" ? VI_PAGES[slug] : EN_PAGES[slug];
}

export function marketingPageUi(locale: UiLanguage): MarketingPageUiCopy {
  return locale === "vi" ? VI_UI : EN_UI;
}

export function featuresPageCopy(locale: UiLanguage): FeaturesPageCopy {
  return locale === "vi" ? VI_FEATURES : EN_FEATURES;
}

export function workflowPageCopy(locale: UiLanguage): WorkflowPageCopy {
  return locale === "vi" ? VI_WORKFLOW : EN_WORKFLOW;
}

export function aboutPageCopy(locale: UiLanguage): AboutPageCopy {
  return locale === "vi" ? VI_ABOUT : EN_ABOUT;
}
