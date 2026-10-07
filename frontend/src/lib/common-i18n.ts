import type { UiLanguage } from "@/lib/researcher-profile";

type CommonCopy = {
  masthead: {
    vol: string;
    internationalEdition: string;
    guestSignIn: string;
    signedIn: string;
    openEditor: string;
    back: string;
  };
  nav: {
    features: string;
    workflow: string;
    guide: string;
    templates: string;
    pricing: string;
  };
  footer: {
    tagline: string;
    edition: string;
    copyright: string;
    credit: string;
    motto: string;
    sections: {
      desk: string;
      authors: string;
      bureau: string;
      legal: string;
    };
    links: {
      features: string;
      workflow: string;
      guide: string;
      integrity: string;
      templates: string;
      openEditor: string;
      latexGuide: string;
      about: string;
      contact: string;
      terms: string;
      privacy: string;
      ethics: string;
      dataUse: string;
    };
  };
  ticker: string[];
  workspace: {
    projects: string;
    templates: string;
    profile: string;
    plan: string;
    planFree: string;
    planPro: string;
    admin: string;
    userGuide: string;
    signOut: string;
    loadingAccount: string;
  };
  auth: {
    pleaseWait: string;
    disabledAccount: {
      eyebrow: string;
      title: string;
      body: string;
      useAnother: string;
    };
  };
  shell: {
    loading: string;
    loadingRoute: string;
    loadingProject: string;
    openingEditor: string;
    loadingShared: string;
    loadingEyebrow: string;
    loadingMasthead: string;
    loadingSubline: string;
    loadingFooter: string;
    notFound: {
      code: string;
      eyebrow: string;
      title: string;
      body: string;
      asideQuote: string;
      asideFooter: string;
      home: string;
      projects: string;
    };
  };
};

const EN: CommonCopy = {
  masthead: {
    vol: "Vol. I · No. 01",
    internationalEdition: "International Edition",
    guestSignIn: "Guest · Sign in to save",
    signedIn: "Signed in ·",
    openEditor: "Open Editor",
    back: "Back",
  },
  nav: {
    features: "Features",
    workflow: "Workflow",
    guide: "User Guide",
    templates: "Templates",
    pricing: "Pricing",
  },
  footer: {
    tagline: "AI Academic Writing & Editing Assistant.",
    edition: "Edition Vol. I · Printed for the web ·",
    copyright: "Edico Editorial Co.",
    credit: "Designed & built by",
    motto: "All the science that's fit to publish.",
    sections: { desk: "Desk", authors: "Authors", bureau: "Bureau", legal: "Legal" },
    links: {
      features: "Features",
      workflow: "Workflow",
      guide: "User Guide",
      integrity: "Integrity",
      templates: "Templates",
      openEditor: "Open Editor",
      latexGuide: "LaTeX Guide",
      about: "About",
      contact: "Contact",
      terms: "Terms",
      privacy: "Privacy",
      ethics: "Ethics",
      dataUse: "Data Use",
    },
  },
  ticker: [
    "From draft to proof",
    "AI academic writing & editing assistant",
    "LaTeX upload · edit · compile · preview",
    "Expression support — never invent data or results",
    "For researchers who are not native English speakers",
  ],
  workspace: {
    projects: "Projects",
    templates: "Templates",
    profile: "Profile",
    plan: "Plan",
    planFree: "Free",
    planPro: "Pro",
    admin: "Admin",
    userGuide: "User Guide",
    signOut: "Sign out",
    loadingAccount: "Loading account…",
  },
  auth: {
    pleaseWait: "Please wait…",
    disabledAccount: {
      eyebrow: "Account disabled",
      title: "Sign-in blocked",
      body: "This account has been temporarily locked by an administrator. If you believe this is a mistake, contact the platform admin.",
      useAnother: "Sign in with another account",
    },
  },
  shell: {
    loading: "Loading…",
    loadingRoute: "Opening page…",
    loadingProject: "Loading manuscript…",
    openingEditor: "Opening desk session…",
    loadingShared: "Loading shared manuscript…",
    loadingEyebrow: "Desk session",
    loadingMasthead: "Manuscript desk · Loading",
    loadingSubline: "Preparing your session",
    loadingFooter: "Vol. I · No. 01 · From draft to proof",
    notFound: {
      code: "404",
      eyebrow: "Missing manuscript",
      title: "This page is not in our catalogue.",
      body: "The address may be mistyped, expired, or the page may have moved. Return to the desk and continue from there.",
      asideQuote: "“Not every draft finds its folder — but every good paper finds its way.”",
      asideFooter: "Vol. I · No. 01 · Errata",
      home: "Back to home",
      projects: "Open projects",
    },
  },
};

const VI: CommonCopy = {
  masthead: {
    vol: "Tập I · Số 01",
    internationalEdition: "Ấn bản Quốc tế",
    guestSignIn: "Khách · Đăng nhập để lưu",
    signedIn: "Đã đăng nhập ·",
    openEditor: "Mở Trình biên tập",
    back: "Quay lại",
  },
  nav: {
    features: "Tính năng",
    workflow: "Quy trình",
    guide: "Hướng dẫn",
    templates: "Mẫu bài",
    pricing: "Bảng giá",
  },
  footer: {
    tagline: "AI Trợ Lý Viết & Biên Tập Bài Báo Khoa Học.",
    edition: "Ấn bản Tập I · In trên web ·",
    copyright: "Edico Editorial Co.",
    credit: "Thiết kế & phát triển bởi",
    motto: "Mọi khoa học xứng đáng được xuất bản.",
    sections: { desk: "Ban biên tập", authors: "Tác giả", bureau: "Văn phòng", legal: "Pháp lý" },
    links: {
      features: "Tính năng",
      workflow: "Quy trình",
      guide: "Hướng dẫn sử dụng",
      integrity: "Toàn vẹn",
      templates: "Mẫu bài",
      openEditor: "Mở Trình biên tập",
      latexGuide: "Hướng dẫn LaTeX",
      about: "Giới thiệu",
      contact: "Liên hệ",
      terms: "Điều khoản",
      privacy: "Quyền riêng tư",
      ethics: "Đạo đức",
      dataUse: "Sử dụng dữ liệu",
    },
  },
  ticker: [
    "Từ bản thảo đến bản in",
    "Trợ lý AI viết & biên tập học thuật",
    "LaTeX tải lên · chỉnh sửa · biên dịch · xem trước",
    "Hỗ trợ diễn đạt — không bao giờ bịa dữ liệu hay kết quả",
    "Dành cho nhà nghiên cứu không phải người bản ngữ tiếng Anh",
  ],
  workspace: {
    projects: "Dự án",
    templates: "Mẫu bài",
    profile: "Hồ sơ",
    plan: "Gói",
    planFree: "Miễn phí",
    planPro: "Pro",
    admin: "Quản trị",
    userGuide: "Hướng dẫn",
    signOut: "Đăng xuất",
    loadingAccount: "Đang tải tài khoản…",
  },
  auth: {
    pleaseWait: "Vui lòng đợi…",
    disabledAccount: {
      eyebrow: "Tài khoản bị vô hiệu hóa",
      title: "Không thể đăng nhập",
      body: "Tài khoản này đã bị quản trị viên tạm khóa. Nếu bạn cho rằng đây là nhầm lẫn, hãy liên hệ admin của nền tảng.",
      useAnother: "Đăng nhập tài khoản khác",
    },
  },
  shell: {
    loading: "Đang tải…",
    loadingRoute: "Đang mở trang…",
    loadingProject: "Đang tải bản thảo…",
    openingEditor: "Đang mở phiên biên tập…",
    loadingShared: "Đang tải bản thảo được chia sẻ…",
    loadingEyebrow: "Phiên biên tập",
    loadingMasthead: "Bàn biên tập · Đang tải",
    loadingSubline: "Đang chuẩn bị phiên làm việc",
    loadingFooter: "Tập I · Số 01 · Từ bản thảo đến bản in",
    notFound: {
      code: "404",
      eyebrow: "Không tìm thấy",
      title: "Trang này không có trong mục lục.",
      body: "Địa chỉ có thể sai, hết hạn, hoặc trang đã được chuyển đi. Quay lại bàn biên tập và tiếp tục từ đó.",
      asideQuote:
        "“Không phải bản thảo nào cũng nằm đúng ngăn — nhưng bài tốt luôn tìm được lối ra.”",
      asideFooter: "Tập I · Số 01 · Đính chính",
      home: "Về trang chủ",
      projects: "Mở dự án",
    },
  },
};

export function commonCopy(lang: UiLanguage): CommonCopy {
  return lang === "vi" ? VI : EN;
}
