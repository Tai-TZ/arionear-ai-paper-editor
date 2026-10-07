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
  openProjectAria: (name: string) => string;
  defenseAria: string;
  defenseTitle: string;
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
  errorLoad: string;
  loadErrorTitle: string;
  retry: string;
  importSuccess: (texFiles: number, images: number, assets: number) => string;
  deleteConfirmTitle: string;
  deleteConfirmBody: (name: string) => string;
  deleteConfirmAction: string;
  cancel: string;
  formatNoticeTitle: string;
  formatNoticeBody: string;
  formatNoticeImradLabel: string;
  formatNoticeImradDetail: string;
  formatNoticeImportNote: string;
  formatNoticeConfirm: string;
};

const EN: ProjectsCopy = {
  pageTitle: "Your Projects — Proofline",
  pageDescription:
    "Write IMRaD scientific papers with IEEE, Springer or Elsevier templates, or import an existing project.",
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
    "IMRaD structure (Introduction, Methods, Results, Discussion) in IEEE journal format. Open the sample project to get started.",
  emptyBlankHint: "Blank outline with IMRaD sections ready for your content.",
  emptySampleHint: "Filled sample you can edit and compile to explore Proofline.",
  created: "Created",
  updated: "Updated",
  colName: "Name",
  colCreated: "Created",
  colUpdated: "Last update",
  renameAria: "Rename project",
  renameTitle: "Rename project (double-click name)",
  deleteAria: "Delete project",
  deleteTitle: "Delete project",
  openProjectAria: (name) => `Open ${name}`,
  defenseAria: "Defense",
  defenseTitle: "Prepare your defense (Defense Mode)",
  creatingSample: "Creating sample project…",
  creatingBlank: "Creating blank project…",
  sampleProjectName: "IEEE IMRaD (Sample)",
  blankProjectName: "IEEE IMRaD Project",
  uploading: "Uploading project…",
  importingZip: "Importing Overleaf ZIP…",
  importingZipDetail: "Extracting files and uploading to your account…",
  errorCreate: "Failed to create project.",
  errorUpload: "Failed to upload project.",
  errorNoTex: "Select at least one .tex file.",
  errorImport: "ZIP import failed.",
  errorRename: "Failed to rename project.",
  errorDelete: "Failed to delete project.",
  errorLoad: "Failed to load projects.",
  loadErrorTitle: "Couldn't load your projects",
  retry: "Retry",
  importSuccess: (texFiles, images, assets) =>
    `Imported ${texFiles} .tex file${texFiles === 1 ? "" : "s"} and ${images} image${images === 1 ? "" : "s"} (${assets} asset${assets === 1 ? "" : "s"}).`,
  deleteConfirmTitle: "Delete this project?",
  deleteConfirmBody: (name) =>
    `“${name}” and all of its files, chats and history will be permanently deleted. This can’t be undone.`,
  deleteConfirmAction: "Delete project",
  cancel: "Cancel",
  formatNoticeTitle: "Journal templates & IMRaD",
  formatNoticeBody:
    "Proofline works best with IMRaD scientific papers built on a journal template: IEEE (IEEEtran), Springer LNCS or Elsevier (elsarticle).",
  formatNoticeImradLabel: "IMRaD sections",
  formatNoticeImradDetail:
    "Introduction · Methods · Results · Discussion — plus Abstract and keywords.",
  formatNoticeImportNote:
    "Blank and sample projects start from the IEEE template — pick another journal in the template gallery. Imported projects work best when they already follow an IMRaD structure.",
  formatNoticeConfirm: "Got it",
};

const VI: ProjectsCopy = {
  pageTitle: "Dự án của bạn — Proofline",
  pageDescription:
    "Viết bài báo khoa học theo IMRaD với mẫu IEEE, Springer hoặc Elsevier, hoặc nhập dự án có sẵn.",
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
    "Theo khung IMRaD (Giới thiệu, Phương pháp, Kết quả, Thảo luận) và định dạng tạp chí IEEE. Chọn dự án mẫu để bắt đầu.",
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
  openProjectAria: (name) => `Mở ${name}`,
  defenseAria: "Phản biện",
  defenseTitle: "Chuẩn bị bảo vệ (Defense Mode)",
  creatingSample: "Đang tạo dự án mẫu…",
  creatingBlank: "Đang tạo dự án trống…",
  sampleProjectName: "IEEE IMRaD (Mẫu)",
  blankProjectName: "Bài báo IEEE IMRaD",
  uploading: "Đang tải dự án…",
  importingZip: "Đang nhập Overleaf ZIP…",
  importingZipDetail: "Đang giải nén và tải lên tài khoản của bạn…",
  errorCreate: "Không tạo được dự án.",
  errorUpload: "Tải dự án thất bại.",
  errorNoTex: "Hãy chọn ít nhất một file .tex.",
  errorImport: "Nhập ZIP thất bại.",
  errorRename: "Đổi tên dự án thất bại.",
  errorDelete: "Xóa dự án thất bại.",
  errorLoad: "Không tải được danh sách dự án.",
  loadErrorTitle: "Không tải được dự án của bạn",
  retry: "Thử lại",
  importSuccess: (texFiles, images, assets) =>
    `Đã import ${texFiles} file .tex, ${images} ảnh (${assets} assets).`,
  deleteConfirmTitle: "Xóa dự án này?",
  deleteConfirmBody: (name) =>
    `“${name}” cùng toàn bộ file, đoạn chat và lịch sử sẽ bị xóa vĩnh viễn. Không thể hoàn tác.`,
  deleteConfirmAction: "Xóa dự án",
  cancel: "Hủy",
  formatNoticeTitle: "Mẫu tạp chí & IMRaD",
  formatNoticeBody:
    "Proofline hoạt động tốt nhất với bài báo khoa học theo cấu trúc IMRaD, dựng trên một mẫu tạp chí: IEEE (IEEEtran), Springer LNCS hoặc Elsevier (elsarticle).",
  formatNoticeImradLabel: "Các phần IMRaD",
  formatNoticeImradDetail:
    "Giới thiệu · Phương pháp · Kết quả · Thảo luận — kèm Tóm tắt (Abstract) và từ khóa.",
  formatNoticeImportNote:
    "Dự án trống và dự án mẫu bắt đầu từ mẫu IEEE — chọn tạp chí khác trong thư viện mẫu. Dự án nhập vào hoạt động tốt nhất khi đã theo cấu trúc IMRaD.",
  formatNoticeConfirm: "Đã hiểu",
};

export function projectsCopy(lang: UiLanguage): ProjectsCopy {
  return lang === "vi" ? VI : EN;
}
