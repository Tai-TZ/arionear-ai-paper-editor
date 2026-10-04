import type { LogicAuditReport } from "@/lib/api/academic";
import type { StoredDefenseSession } from "@/lib/defense-session-storage";
export { formatProjectDateTime, formatTimeAgo, parseApiTimestamp } from "@/lib/date-i18n";

export type ProjectAsset = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type ProjectFile = {
  path: string;
  content: string;
};

export type LatexCompiler = "auto" | "pdflatex" | "xelatex" | "lualatex" | "latex";

export type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

export type StoredPendingEdit = {
  id: string;
  file: string;
  section?: string;
  applyMode: "selection" | "document";
  originalText: string;
  replacementText: string;
  description?: string;
  flags: { code: string; message: string; severity: string }[];
  revisionId?: string;
  selectionStart?: number;
  selectionEnd?: number;
  sourceFingerprint?: string;
};

export type ChatThread = {
  id: string;
  title: string;
  messages: StoredChatMessage[];
  pendingEdits?: StoredPendingEdit[];
  activeEditId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type StoredProject = {
  id: string;
  name: string;
  latex: string;
  files?: ProjectFile[];
  mainFile?: string;
  compiler?: LatexCompiler;
  assets?: ProjectAsset[];
  logicAuditReport?: LogicAuditReport;
  gateAuditReport?: LogicAuditReport;
  gateAuditFingerprint?: string;
  chatThreads?: ChatThread[];
  defenseSession?: StoredDefenseSession;
  createdAt: number;
  updatedAt: number;
};

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".pdf",
  ".eps",
]);

const LATEX_SUPPORT_EXTENSIONS = new Set([
  ".cls",
  ".bst",
  ".sty",
  // NOTE: .bib is intentionally excluded — it is a plain-text file edited in the code editor
]);

const TEX_EXTENSIONS = new Set([".tex", ".latex"]);

const DEFAULT_MAIN_FILE = "main.tex";

/** XeLaTeX + fontspec so Vietnamese diacritics compile reliably. */
const VIETNAMESE_PREAMBLE = `\\usepackage{fontspec}
\\setmainfont{Latin Modern Roman}
`;

const SAMPLE_LATEX_EN = `\\documentclass[journal]{IEEEtran}

\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{textcomp}
\\usepackage{xcolor}

\\begin{document}

\\title{Sample IEEE Journal Manuscript (IMRaD)}
\\author{Author Name}

\\maketitle

\\begin{abstract}
This sample follows the IEEEtran journal layout with IMRaD sections.
Use it to explore compile, preview, and Arionear editorial tools before replacing every placeholder with your own research content.
\\end{abstract}

\\begin{IEEEkeywords}
IEEEtran, IMRaD, scientific writing, LaTeX, journal article.
\\end{IEEEkeywords}

\\section{Introduction}
Scientific manuscripts benefit from a predictable structure.
The Introduction states the problem, prior work, and the contribution you intend to make in this paper.

\\section{Methods}
Describe datasets, experimental setup, and evaluation metrics here.
Keep procedures reproducible and aligned with the claims you will present in Results.

\\section{Results}
Report key findings with tables or figures as needed.
Replace these placeholder sentences with measured outcomes from your study.

\\section{Discussion}
Interpret the Results, note limitations, and compare against related studies.
Avoid introducing new empirical claims that are not supported in Results.

\\section{Conclusion}
Summarize contributions and outline practical next steps for readers and future work.

\\end{document}`;

export const SAMPLE_LATEX_VI = `\\documentclass[journal]{IEEEtran}

${VIETNAMESE_PREAMBLE}\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{textcomp}
\\usepackage{xcolor}

\\begin{document}

\\title{Bài báo mẫu IEEE (IMRaD)}
\\author{Tên tác giả}

\\maketitle

\\begin{abstract}
Bản mẫu này theo bố cục tạp chí IEEEtran với các phần IMRaD.
Dùng để khám phá biên dịch, xem trước PDF và các công cụ biên tập của Arionear trước khi thay thế toàn bộ nội dung mẫu bằng nghiên cứu của bạn.
\\end{abstract}

\\begin{IEEEkeywords}
IEEEtran, IMRaD, bài báo khoa học, LaTeX, tạp chí.
\\end{IEEEkeywords}

\\section{Giới thiệu}
Bài báo khoa học cần cấu trúc rõ ràng và nhất quán.
Phần Giới thiệu nêu vấn đề nghiên cứu, công trình liên quan và đóng góp chính của bài báo.

\\section{Phương pháp}
Mô tả bộ dữ liệu, thiết lập thực nghiệm và các chỉ số đánh giá tại đây.
Giữ quy trình có thể tái lập và phù hợp với các kết luận sẽ trình bày ở phần Kết quả.

\\section{Kết quả}
Trình bày các phát hiện chính bằng bảng hoặc hình minh họa khi cần.
Thay các câu mẫu này bằng số liệu và kết quả đo được từ nghiên cứu của bạn.

\\section{Thảo luận}
Diễn giải kết quả, nêu hạn chế và so sánh với các công trình liên quan.
Tránh đưa ra khẳng định mới không được hỗ trợ ở phần Kết quả.

\\section{Kết luận}
Tóm tắt đóng góp và hướng phát triển tiếp theo cho độc giả.

\\end{document}`;

const BLANK_LATEX_EN = `\\documentclass[journal]{IEEEtran}

\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{textcomp}
\\usepackage{xcolor}

\\begin{document}

\\title{Untitled Manuscript}
\\author{Author Name}

\\maketitle

\\begin{abstract}
% TODO: Summarize objective, methods, and main results.
\\end{abstract}

\\begin{IEEEkeywords}
% TODO: Add 3--5 keywords.
\\end{IEEEkeywords}

\\section{Introduction}
% TODO: Background, objectives, and contributions.

\\section{Methods}
% TODO: Data, procedures, and evaluation setup.

\\section{Results}
% TODO: Present key findings (keep numbers factual).

\\section{Discussion}
% TODO: Interpret results and relate to prior work.

\\section{Conclusion}
% TODO: Summary and future work.

\\end{document}`;

const BLANK_LATEX_VI = `\\documentclass[journal]{IEEEtran}

${VIETNAMESE_PREAMBLE}\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{textcomp}
\\usepackage{xcolor}

\\begin{document}

\\title{Bài báo chưa đặt tên}
\\author{Tên tác giả}

\\maketitle

\\begin{abstract}
% TODO: Tóm tắt mục tiêu, phương pháp và kết quả chính.
\\end{abstract}

\\begin{IEEEkeywords}
% TODO: Thêm 3–5 từ khóa.
\\end{IEEEkeywords}

\\section{Giới thiệu}
% TODO: Bối cảnh, mục tiêu và đóng góp.

\\section{Phương pháp}
% TODO: Dữ liệu, quy trình và thiết lập đánh giá.

\\section{Kết quả}
% TODO: Trình bày phát hiện chính (giữ số liệu chính xác).

\\section{Thảo luận}
% TODO: Diễn giải kết quả và liên hệ công trình trước.

\\section{Kết luận}
% TODO: Tóm tắt và hướng phát triển.

\\end{document}`;

export function sampleLatexForLocale(lang: "vi" | "en"): string {
  return lang === "vi" ? SAMPLE_LATEX_VI : SAMPLE_LATEX_EN;
}

export function blankLatexForLocale(lang: "vi" | "en"): string {
  return lang === "vi" ? BLANK_LATEX_VI : BLANK_LATEX_EN;
}

export function normalizeProject(project: StoredProject): StoredProject {
  const mainFile = project.mainFile ?? DEFAULT_MAIN_FILE;
  const files = project.files?.length
    ? project.files.map((f) => ({ path: normalizeAssetName(f.path), content: f.content }))
    : [{ path: mainFile, content: project.latex }];

  const mainContent =
    files.find((f) => f.path === mainFile)?.content ?? files[0]?.content ?? project.latex;

  return {
    ...project,
    mainFile,
    compiler: project.compiler ?? "auto",
    files,
    latex: mainContent,
  };
}

export function isTexFile(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return TEX_EXTENSIONS.has(ext);
}

export function isImageAssetFile(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function isLatexSupportAssetFile(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return LATEX_SUPPORT_EXTENSIONS.has(ext);
}

export function isBibFile(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase() === ".bib";
}

export function isBinaryProjectAsset(name: string) {
  return isImageAssetFile(name) || isLatexSupportAssetFile(name);
}

export function isProjectAssetFile(name: string) {
  return isBinaryProjectAsset(name);
}

export function normalizeAssetName(name: string) {
  return name.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

export function findProjectAsset(path: string, assets: ProjectAsset[] = []): ProjectAsset | null {
  const key = normalizeAssetName(path);
  const lower = key.toLowerCase();
  const basename = key.split("/").pop()?.toLowerCase() ?? lower;
  return (
    assets.find((asset) => {
      const name = normalizeAssetName(asset.name).toLowerCase();
      return name === lower || name.endsWith(`/${basename}`);
    }) ?? null
  );
}

export function readFileAsDataUrl(file: File): Promise<ProjectAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      resolve({
        name: normalizeAssetName(file.name),
        mimeType: file.type || "application/octet-stream",
        dataUrl: reader.result,
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function inferProjectName(latex: string, fallback = "Imported Project") {
  const match = latex.match(/\\title\{([^}]*)\}/);
  if (match?.[1]) return match[1].replace(/\\\\/g, " ").trim();
  return fallback;
}

export function detectMainTexFile(paths: string[]): string {
  const normalized = paths.map(normalizeAssetName);
  if (normalized.includes("main.tex")) return "main.tex";
  const texFiles = normalized.filter(isTexFile);
  const withDocclass = texFiles.find((path) => {
    // caller should pass contents map when available; fallback to name heuristics
    return /main/i.test(path);
  });
  return withDocclass ?? texFiles[0] ?? DEFAULT_MAIN_FILE;
}

function textToDataUrl(content: string): string {
  const bytes = new TextEncoder().encode(content);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:text/plain;base64,${btoa(binary)}`;
}

/** Flatten multi-file projects so the defense agent sees \\input'd content. */
export function buildDefenseLatexContext(
  project: Pick<StoredProject, "latex" | "files" | "mainFile">,
): string {
  const normalized = normalizeProject({
    id: "",
    name: "",
    latex: project.latex,
    files: project.files,
    mainFile: project.mainFile,
    createdAt: 0,
    updatedAt: 0,
  });
  const files = normalized.files ?? [];
  const texFiles = files.filter((f) => isTexFile(f.path) || isBibFile(f.path));
  if (texFiles.length <= 1) return normalized.latex;
  return texFiles.map((f) => `%% FILE: ${f.path}\n${f.content}`).join("\n\n");
}

export function getCompilePayload(project: StoredProject) {
  const normalized = normalizeProject(project);
  const mainFile = normalized.mainFile ?? DEFAULT_MAIN_FILE;
  const mainContent =
    normalized.files?.find((f) => f.path === mainFile)?.content ?? normalized.latex;

  const texAssets =
    normalized.files
      ?.filter((f) => f.path !== mainFile && (isTexFile(f.path) || isBibFile(f.path)))
      .map((f) => ({
        name: f.path,
        dataUrl: textToDataUrl(f.content),
      })) ?? [];

  const binaryAssets = normalized.assets ?? [];

  return {
    latex: mainContent,
    mainFile,
    compiler: normalized.compiler ?? "auto",
    assets: [...texAssets, ...binaryAssets],
  };
}
