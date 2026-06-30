import type { UiLanguage } from "@/lib/researcher-profile";

type AuthPagesCopy = {
  shell: {
    bannerEyebrow: string;
    bannerQuote: string;
    bannerLede: string;
    bannerFooter: string;
    mobileBack: string;
    footerCopyright: string;
    footerTagline: string;
  };
  signin: {
    eyebrow: string;
    title: string;
    lede: string;
    emailLabel: string;
    passwordLabel: string;
    remember: string;
    forgot: string;
    submit: string;
    dividerGoogle: string;
    newHere: string;
    createAccount: string;
  };
  forgotPassword: {
    eyebrow: string;
    title: string;
    lede: string;
    noticePosted: string;
    checkInbox: string;
    devMode: string;
    openResetLink: string;
    useDifferentEmail: string;
    accountEmail: string;
    sendReset: string;
    backToSignIn: string;
    createAccount: string;
  };
  resetPassword: {
    eyebrow: string;
    title: string;
    lede: string;
    newPassword: string;
    newPasswordPlaceholder: string;
    confirmPassword: string;
    confirmPlaceholder: string;
    mismatch: string;
    updatePassword: string;
    backToSignIn: string;
  };
  signup: {
    eyebrowForm: string;
    titleForm: string;
    ledeForm: string;
    eyebrowVerify: string;
    titleVerify: string;
    ledeVerifyDev: (email: string) => string;
    ledeVerify: (email: string) => string;
    verificationCode: string;
    devNoEmailSent: string;
    yourCodeIs: string;
    verifyAndCreate: string;
    backToForm: string;
    resendCode: string;
    resendCooldown: (seconds: number) => string;
    dividerGoogle: string;
    alreadyHave: string;
    signIn: string;
    fullNameLabel: string;
    fullNamePlaceholder: string;
    affiliationLabel: string;
    affiliationPlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    integrityPolicy: string;
    continue: string;
    acceptPolicyError: string;
    passwordTooShort: string;
    passwordTooLong: string;
    passwordNeedsLetter: string;
    passwordNeedsNumber: string;
    strengthWeak: string;
    strengthFair: string;
    strengthGood: string;
    strengthStrong: string;
  };
  sso: {
    continueWithGoogle: string;
  };
  googleCallback: {
    pageTitle: string;
    eyebrow: string;
    title: string;
    lede: string;
    completing: string;
    noSession: string;
    backToSignIn: string;
    signInFailed: string;
    signInSuccess: string;
    welcomeBack: (name: string) => string;
    couldNotComplete: string;
    cancelled: string;
    expired: string;
  };
};

const EN: AuthPagesCopy = {
  shell: {
    bannerEyebrow: "The Editor's Desk",
    bannerQuote: "“Good writing is rewriting. We just make the second pass faster.”",
    bannerLede:
      "Arionear reads like a copy-editor and questions like a reviewer — never inventing data, always citing the source.",
    bannerFooter: "Vol. I · No. 01 · International Edition",
    mobileBack: "Back",
    footerCopyright: "© Arionear Press",
    footerTagline: "Closer to publication",
  },
  signin: {
    eyebrow: "The Reading Room",
    title: "Sign in to continue.",
    lede: "Pick up where you left the margins — your drafts, marks and reviewer replies are waiting.",
    emailLabel: "Email address",
    passwordLabel: "Password",
    remember: "Remember me",
    forgot: "Forgot?",
    submit: "Sign in",
    dividerGoogle: "or continue with Google",
    newHere: "New to Arionear?",
    createAccount: "Create an account",
  },
  forgotPassword: {
    eyebrow: "Errata & Corrections",
    title: "Forgot your password?",
    lede: "Send us the email on file. We'll mail back a one-time link to set a new one — no questions, no fanfare.",
    noticePosted: "Notice posted",
    checkInbox: "Check your inbox.",
    devMode: "Dev mode:",
    openResetLink: "Open reset link",
    useDifferentEmail: "Use a different email",
    accountEmail: "Account email",
    sendReset: "Send reset link",
    backToSignIn: "Back to sign in",
    createAccount: "Create account",
  },
  resetPassword: {
    eyebrow: "New Credentials",
    title: "Set a new password.",
    lede: "Choose a strong password you have not used on Arionear before. This link works once and expires in 30 minutes.",
    newPassword: "New password",
    newPasswordPlaceholder: "At least 8 characters, 1 letter & 1 number",
    confirmPassword: "Confirm password",
    confirmPlaceholder: "Repeat password",
    mismatch: "Passwords do not match.",
    updatePassword: "Update password",
    backToSignIn: "Back to sign in",
  },
  signup: {
    eyebrowForm: "New Submission",
    titleForm: "Create your account.",
    ledeForm: "Register once. Carry your manuscripts, marks and reviewer correspondence across every revision.",
    eyebrowVerify: "Proof of address",
    titleVerify: "Verify your email.",
    ledeVerifyDev: (email) => `Development mode — no email is sent to ${email}. Enter the code shown below.`,
    ledeVerify: (email) => `We sent a 6-digit code to ${email}. Enter it below to finish creating your account.`,
    verificationCode: "Verification code",
    devNoEmailSent: "Development — no email sent",
    yourCodeIs: "Your verification code is",
    verifyAndCreate: "Verify & create account",
    backToForm: "Back to form",
    resendCode: "Resend code",
    resendCooldown: (seconds) => `Resend in ${seconds}s`,
    dividerGoogle: "or continue with Google",
    alreadyHave: "Already have an account?",
    signIn: "Sign in",
    fullNameLabel: "Full name",
    fullNamePlaceholder: "Dr. Jane Doe",
    affiliationLabel: "Affiliation",
    affiliationPlaceholder: "VNU, MIT, …",
    emailLabel: "Academic email",
    emailPlaceholder: "name@university.edu",
    passwordLabel: "Password",
    passwordPlaceholder: "At least 8 characters, 1 letter & 1 number",
    integrityPolicy:
      "I agree to Arionear's editorial integrity policy — AI assists with language and structure; the author remains responsible for the science.",
    continue: "Continue",
    acceptPolicyError: "Please accept the editorial integrity policy to continue.",
    passwordTooShort: "Password must be at least 8 characters.",
    passwordTooLong: "Password must be at most 72 characters.",
    passwordNeedsLetter: "Password must include at least one letter.",
    passwordNeedsNumber: "Password must include at least one number.",
    strengthWeak: "Weak",
    strengthFair: "Fair",
    strengthGood: "Good",
    strengthStrong: "Strong",
  },
  sso: {
    continueWithGoogle: "Continue with Google",
  },
  googleCallback: {
    pageTitle: "Signing in — Arionear",
    eyebrow: "Single Sign-On",
    title: "One moment.",
    lede: "We are verifying your Google account and opening your editorial desk.",
    completing: "Completing Google sign-in…",
    noSession: "Google sign-in did not return a session. Please try again.",
    backToSignIn: "Back to sign in",
    signInFailed: "Sign in failed",
    signInSuccess: "Signed in",
    welcomeBack: (name) => `Welcome back, ${name}.`,
    couldNotComplete: "Could not complete Google sign-in.",
    cancelled: "Google sign-in was cancelled.",
    expired: "Sign-in session expired. Please try again.",
  },
};

const VI: AuthPagesCopy = {
  shell: {
    bannerEyebrow: "Bàn biên tập",
    bannerQuote: "“Viết hay là viết lại. Chúng tôi giúp vòng hai nhanh hơn.”",
    bannerLede:
      "Arionear đọc như biên tập viên và hỏi như phản biện — không bịa dữ liệu, luôn trích nguồn rõ ràng.",
    bannerFooter: "Tập I · Số 01 · Ấn bản quốc tế",
    mobileBack: "Quay lại",
    footerCopyright: "© Arionear Press",
    footerTagline: "Gần hơn với công bố",
  },
  signin: {
    eyebrow: "Phòng đọc",
    title: "Đăng nhập để tiếp\u00A0tục.",
    lede: "Tiếp tục nơi bạn đã dừng — bản thảo, ghi chú và phản hồi phản biện đang chờ bạn.",
    emailLabel: "Email",
    passwordLabel: "Mật khẩu",
    remember: "Ghi nhớ đăng nhập",
    forgot: "Quên mật khẩu?",
    submit: "Đăng nhập",
    dividerGoogle: "hoặc tiếp tục với Google",
    newHere: "Mới dùng Arionear?",
    createAccount: "Tạo tài khoản",
  },
  forgotPassword: {
    eyebrow: "Đính chính",
    title: "Quên mật khẩu?",
    lede: "Nhập email đã đăng ký. Chúng tôi sẽ gửi một liên kết dùng một lần để đặt lại mật khẩu — nhanh gọn, không rườm rà.",
    noticePosted: "Thông báo đã gửi",
    checkInbox: "Kiểm tra hộp thư.",
    devMode: "Dev mode:",
    openResetLink: "Mở liên kết đặt lại",
    useDifferentEmail: "Dùng email khác",
    accountEmail: "Email tài khoản",
    sendReset: "Gửi link đặt lại",
    backToSignIn: "Quay lại đăng nhập",
    createAccount: "Tạo tài khoản",
  },
  resetPassword: {
    eyebrow: "Thông tin mới",
    title: "Đặt mật khẩu mới.",
    lede: "Chọn mật khẩu mạnh mà bạn chưa từng dùng trên Arionear. Liên kết chỉ dùng một lần và hết hạn sau 30 phút.",
    newPassword: "Mật khẩu mới",
    newPasswordPlaceholder: "Tối thiểu 8 ký tự, 1 chữ cái & 1 số",
    confirmPassword: "Xác nhận mật khẩu",
    confirmPlaceholder: "Nhập lại mật khẩu",
    mismatch: "Mật khẩu không khớp.",
    updatePassword: "Cập nhật mật khẩu",
    backToSignIn: "Quay lại đăng nhập",
  },
  signup: {
    eyebrowForm: "Bản thảo mới",
    titleForm: "Tạo tài khoản.",
    ledeForm: "Đăng ký một lần. Mang theo bản thảo, ghi chú và trao đổi phản biện qua mọi vòng sửa.",
    eyebrowVerify: "Xác minh địa chỉ",
    titleVerify: "Xác minh email.",
    ledeVerifyDev: (email) => `Chế độ dev — không gửi email tới ${email}. Nhập mã hiển thị bên dưới.`,
    ledeVerify: (email) => `Chúng tôi đã gửi mã 6 chữ số tới ${email}. Nhập mã để hoàn tất tạo tài khoản.`,
    verificationCode: "Mã xác minh",
    devNoEmailSent: "Development — không gửi email",
    yourCodeIs: "Mã xác minh của bạn là",
    verifyAndCreate: "Xác minh & tạo tài khoản",
    backToForm: "Quay lại form",
    resendCode: "Gửi lại mã",
    resendCooldown: (seconds) => `Gửi lại sau ${seconds}s`,
    dividerGoogle: "hoặc tiếp tục với Google",
    alreadyHave: "Đã có tài khoản?",
    signIn: "Đăng nhập",
    fullNameLabel: "Họ và tên",
    fullNamePlaceholder: "TS. Nguyễn Văn A",
    affiliationLabel: "Đơn vị công tác",
    affiliationPlaceholder: "VNU, MIT, …",
    emailLabel: "Email học thuật",
    emailPlaceholder: "name@university.edu",
    passwordLabel: "Mật khẩu",
    passwordPlaceholder: "Tối thiểu 8 ký tự, 1 chữ cái & 1 số",
    integrityPolicy:
      "Tôi đồng ý với chính sách trung thực biên tập của Arionear — AI hỗ trợ ngôn ngữ và cấu trúc; tác giả vẫn chịu trách nhiệm về khoa học.",
    continue: "Tiếp tục",
    acceptPolicyError: "Vui lòng chấp nhận chính sách trung thực biên tập để tiếp tục.",
    passwordTooShort: "Mật khẩu phải có ít nhất 8 ký tự.",
    passwordTooLong: "Mật khẩu tối đa 72 ký tự.",
    passwordNeedsLetter: "Mật khẩu phải có ít nhất một chữ cái.",
    passwordNeedsNumber: "Mật khẩu phải có ít nhất một số.",
    strengthWeak: "Yếu",
    strengthFair: "Trung bình",
    strengthGood: "Khá",
    strengthStrong: "Mạnh",
  },
  sso: {
    continueWithGoogle: "Tiếp tục với Google",
  },
  googleCallback: {
    pageTitle: "Đang đăng nhập — Arionear",
    eyebrow: "Đăng nhập một lần",
    title: "Chờ một chút.",
    lede: "Chúng tôi đang xác minh tài khoản Google và mở bàn biên tập của bạn.",
    completing: "Đang hoàn tất đăng nhập Google…",
    noSession: "Đăng nhập Google không trả về phiên làm việc. Vui lòng thử lại.",
    backToSignIn: "Quay lại đăng nhập",
    signInFailed: "Đăng nhập thất bại",
    signInSuccess: "Đã đăng nhập",
    welcomeBack: (name) => `Chào mừng trở lại, ${name}.`,
    couldNotComplete: "Không thể hoàn tất đăng nhập Google. Vui lòng thử lại.",
    cancelled: "Đăng nhập Google đã bị hủy.",
    expired: "Phiên đăng nhập đã hết hạn. Vui lòng thử lại.",
  },
};

export function authPagesCopy(lang: UiLanguage): AuthPagesCopy {
  return lang === "vi" ? VI : EN;
}

