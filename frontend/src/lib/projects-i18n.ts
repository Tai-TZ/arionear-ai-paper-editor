import type { UiLanguage } from "@/lib/researcher-profile";

type ProjectsCopy = {
  pageTitle: string;
  pageDescription: string;
  headerTitle: string;
  searchPlaceholder: string;
  searchAria: string;
  viewAria: string;
  listView: string;
  gridView: string;
  menuCreate: string;
  menuImport: string;
  importZip: string;
  importFolder: string;
  newBtn: string;
  blankProject: string;
  sampleProject: string;
  manuscriptDesk: string;
  projectCountOne: string;
  projectCountMany: string;
  loading: string;
  emptyNoMatches: string;
  emptyTryDifferent: string;
  emptyStartTitle: string;
  emptyStartBody: string;
  emptyBlankHint: string;
  emptySampleHint: string;
  created: string;
  updated: string;
  colName: string;
  colCreated: string;
  colUpdated: string;
  renameAria: string;
  renameTitle: string;
  deleteAria: string;
  deleteTitle: string;
  creatingSample: string;
  creatingBlank: string;
  sampleProjectName: string;
  blankProjectName: string;
  uploading: string;
  importingZip: string;
  importingZipDetail: string;
  errorCreate: string;
  errorUpload: string;
  errorNoTex: string;
  errorImport: string;
  errorRename: string;
  errorDelete: string;
  formatNoticeTitle: string;
  formatNoticeBody: string;
  formatNoticeImradLabel: string;
  formatNoticeImradDetail: string;
  formatNoticeImportNote: string;
  formatNoticeConfirm: string;
};

const EN: ProjectsCopy = {
  pageTitle: "Your Projects — Arionear",
  pageDescription: "Write IMRaD scientific papers in IEEE format, or import from Overleaf.",
  headerTitle: "Your Projects",
  searchPlaceholder: "Search",
  searchAria: "Search projects",
  viewAria: "Project view",
  listView: "List view",
  gridView: "Grid view",
  menuCreate: "Create",
  menuImport: "Import",
  importZip: "Overleaf ZIP",
  importFolder: "Project folder",
  newBtn: "New",
  blankProject: "Blank project",
  sampleProject: "Sample project",
  manuscriptDesk: "Manuscript desk",
  projectCountOne: "project",
  projectCountMany: "projects",
  loading: "Loading your projects…",
  emptyNoMatches: "No matches",
  emptyTryDifferent: "Try a different search term.",
  emptyStartTitle: "Write a scientific paper",
  emptyStartBody:
    "IMRaD structure (Introduction, Methods, Results, Discussion) in IEEE journal format. Start with a blank project or open the sample.",
  emptyBlankHint: "Blank outline with IMRaD sections ready for your content.",
  emptySampleHint: "Filled sample you can edit and compile to explore Arionear.",
  created: "Created",
  updated: "Updated",
  colName: "Name",
  colCreated: "Created",
  colUpdated: "Last update",
  renameAria: "Rename project",
  renameTitle: "Rename project (double-click name)",
  deleteAria: "Delete project",
  deleteTitle: "Delete project",
  creatingSample: "Creating sample project…",
  creatingBlank: "Creating blank project…",
  sampleProjectName: "IEEE IMRaD (Sample)",
  blankProjectName: "IEEE IMRaD Project",
  uploading: "Uploading project…",
  importingZip: "Importing Overleaf ZIP…",
  importingZipDetail: "Extracting files and uploading to your account…",
  errorLoad: "Failed to load projects.",
  errorCreate: "Failed to create project.",
  errorUpload: "Failed to upload project.",
  errorNoTex: "Select at least one .tex file.",
  errorImport: "ZIP import failed.",
  errorRename: "Failed to rename project.",
  errorDelete: "Failed to delete project.",
  formatNoticeTitle: "IEEEtran & IMRaD only",
  formatNoticeBody:
    "Arionear currently supports scientific papers in IEEE journal format (IEEEtran) with an IMRaD structure.",
  formatNoticeImradLabel: "IMRaD sections",
  formatNoticeImradDetail:
    "Introduction · Methods · Results · Discussion — plus Abstract and IEEE keywords.",
  formatNoticeImportNote:
    "Blank and sample projects use this format automatically. Imported Overleaf projects work best when they already follow IEEEtran and IMRaD.",
  formatNoticeConfirm: "Got it",
};

const VI: ProjectsCopy = {
  pageTitle: "Dự án của bạn — Arionear",
  pageDescription: "Viết bài báo khoa học theo IMRaD và chuẩn IEEE, hoặc nhập từ Overleaf.",
  headerTitle: "Dự án của bạn",
  searchPlaceholder: "Tìm kiếm",
  searchAria: "Tìm dự án",
  viewAria: "Chế độ hiển thị",
  listView: "Danh sách",
  gridView: "Lưới",
  menuCreate: "Tạo mới",
  menuImport: "Nhập",
  importZip: "Overleaf ZIP",
  importFolder: "Thư mục dự án",
  newBtn: "Tạo mới",
  blankProject: "Dự án trống",
  sampleProject: "Dự án mẫu",
  manuscriptDesk: "Bàn làm việc",
  projectCountOne: "dự án",
  projectCountMany: "dự án",
  loading: "Đang tải dự án…",
  emptyNoMatches: "Không có kết quả",
  emptyTryDifferent: "Thử từ khóa khác.",
  emptyStartTitle: "Viết bài báo khoa học",
  emptyStartBody:
    "Theo khung IMRaD (Giới thiệu, Phương pháp, Kết quả, Thảo luận) và định dạng tạp chí IEEE. Chọn dự án trống hoặc mẫu để bắt đầu.",
  emptyBlankHint: "Khung bài báo trống — các mục IMRaD sẵn sàng để bạn điền nội dung.",
  emptySampleHint: "Bản mẫu có nội dung minh họa — thay bằng nghiên cứu của bạn.",
  created: "Tạo lúc",
  updated: "Cập nhật",
  colName: "Tên",
  colCreated: "Tạo",
  colUpdated: "Cập nhật",
  renameAria: "Đổi tên dự án",
  renameTitle: "Đổi tên dự án (double-click tên)",
  deleteAria: "Xóa dự án",
  deleteTitle: "Xóa dự án",
  creatingSample: "Đang tạo dự án mẫu…",
  creatingBlank: "Đang tạo dự án trống…",
  sampleProjectName: "IEEE IMRaD (Mẫu)",
  blankProjectName: "Bài báo IEEE IMRaD",
  uploading: "Đang tải dự án…",
  importingZip: "Đang nhập Overleaf ZIP…",
  importingZipDetail: "Đang giải nén và tải lên tài khoản của bạn…",
  errorLoad: "Không tải được danh sách dự án.",
  errorCreate: "Không tạo được dự án.",
  errorUpload: "Tải dự án thất bại.",
  errorNoTex: "Hãy chọn ít nhất một file .tex.",
  errorImport: "Nhập ZIP thất bại.",
  errorRename: "Đổi tên dự án thất bại.",
  errorDelete: "Xóa dự án thất bại.",
  formatNoticeTitle: "Chỉ hỗ trợ IEEEtran & IMRaD",
  formatNoticeBody:
    "Hiện tại Arionear chỉ hỗ trợ viết bài báo khoa học theo định dạng tạp chí IEEE (IEEEtran) và cấu trúc IMRaD.",
  formatNoticeImradLabel: "Các phần IMRaD",
  formatNoticeImradDetail:
    "Giới thiệu · Phương pháp · Kết quả · Thảo luận — kèm Tóm tắt (Abstract) và từ khóa IEEE.",
  formatNoticeImportNote:
    "Dự án trống và dự án mẫu đã dùng sẵn khung này. Dự án nhập từ Overleaf hoạt động tốt nhất khi đã theo IEEEtran và IMRaD.",
  formatNoticeConfirm: "Đã hiểu",
};

export function projectsCopy(lang: UiLanguage): ProjectsCopy {
  return lang === "vi" ? VI : EN;
}

