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
  importBtn: string;
  importZip: string;
  importTexFigures: string;
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
  emptyUpload: string;
  emptyComingSoon: string;
  emptyUploadHint: string;
  emptyUploadHintSoon: string;
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
  uploading: string;
  importingZip: string;
  errorLoad: string;
  errorCreate: string;
  errorUpload: string;
  errorImport: string;
  errorRename: string;
  errorDelete: string;
};

const EN: ProjectsCopy = {
  pageTitle: "Your Projects — Arionear",
  pageDescription: "Upload LaTeX manuscripts or start from a sample project before opening the editor.",
  headerTitle: "Your Projects",
  searchPlaceholder: "Search",
  searchAria: "Search projects",
  viewAria: "Project view",
  listView: "List view",
  gridView: "Grid view",
  importBtn: "Import",
  importZip: "Overleaf ZIP",
  importTexFigures: "Upload .tex + figures",
  newBtn: "New",
  blankProject: "Blank project",
  sampleProject: "Sample project",
  manuscriptDesk: "Manuscript desk",
  projectCountOne: "project",
  projectCountMany: "projects",
  loading: "Loading your projects…",
  emptyNoMatches: "No matches",
  emptyTryDifferent: "Try a different search term.",
  emptyStartTitle: "Start a LaTeX project",
  emptyStartBody: "Upload your manuscript or explore Arionear with a ready-made sample.",
  emptyUpload: "Upload LaTeX",
  emptyComingSoon: "Coming soon",
  emptyUploadHint: "Import a `.tex` file and figure assets together.",
  emptyUploadHintSoon: "Import a `.tex` file and figure assets together — available in a future release.",
  emptySampleHint: "Biomedical NER template with sections and preview ready to explore.",
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
  uploading: "Uploading project…",
  importingZip: "Importing Overleaf ZIP…",
  errorLoad: "Failed to load projects.",
  errorCreate: "Failed to create project.",
  errorUpload: "Failed to upload project.",
  errorImport: "ZIP import failed.",
  errorRename: "Failed to rename project.",
  errorDelete: "Failed to delete project.",
};

const VI: ProjectsCopy = {
  pageTitle: "Dự án của bạn — Arionear",
  pageDescription: "Tải bản thảo LaTeX hoặc bắt đầu với dự án mẫu trước khi mở trình biên tập.",
  headerTitle: "Dự án của bạn",
  searchPlaceholder: "Tìm kiếm",
  searchAria: "Tìm dự án",
  viewAria: "Chế độ hiển thị",
  listView: "Danh sách",
  gridView: "Lưới",
  importBtn: "Nhập",
  importZip: "Overleaf ZIP",
  importTexFigures: "Tải .tex + hình",
  newBtn: "Tạo mới",
  blankProject: "Dự án trống",
  sampleProject: "Dự án mẫu",
  manuscriptDesk: "Bàn làm việc",
  projectCountOne: "dự án",
  projectCountMany: "dự án",
  loading: "Đang tải dự án…",
  emptyNoMatches: "Không có kết quả",
  emptyTryDifferent: "Thử từ khóa khác.",
  emptyStartTitle: "Bắt đầu dự án LaTeX",
  emptyStartBody: "Tải bản thảo của bạn hoặc trải nghiệm Arionear với một dự án mẫu.",
  emptyUpload: "Tải LaTeX",
  emptyComingSoon: "Sắp ra mắt",
  emptyUploadHint: "Nhập file `.tex` kèm các hình minh họa.",
  emptyUploadHintSoon: "Nhập file `.tex` kèm các hình minh họa — sẽ có trong bản phát hành sau.",
  emptySampleHint: "Mẫu Biomedical NER có sẵn cấu trúc và xem trước để bạn khám phá.",
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
  uploading: "Đang tải dự án…",
  importingZip: "Đang nhập Overleaf ZIP…",
  errorLoad: "Không tải được danh sách dự án.",
  errorCreate: "Không tạo được dự án.",
  errorUpload: "Tải dự án thất bại.",
  errorImport: "Nhập ZIP thất bại.",
  errorRename: "Đổi tên dự án thất bại.",
  errorDelete: "Xóa dự án thất bại.",
};

export function projectsCopy(lang: UiLanguage): ProjectsCopy {
  return lang === "vi" ? VI : EN;
}

