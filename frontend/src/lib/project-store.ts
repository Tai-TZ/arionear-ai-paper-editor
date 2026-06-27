import type { LogicAuditReport } from "@/lib/api/academic";
export { formatProjectDateTime, formatTimeAgo } from "@/lib/date-i18n";

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

export type StoredProject = {
  id: string;
  name: string;
  latex: string;
  files?: ProjectFile[];
  mainFile?: string;
  compiler?: LatexCompiler;
  assets?: ProjectAsset[];
  logicAuditReport?: LogicAuditReport;
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
  ".bib",
]);

const TEX_EXTENSIONS = new Set([".tex", ".latex"]);

const BUILTIN_ASSET_URLS: Record<string, string> = {
  "sample.figure.eps": "/assets/sample-figure.svg",
  "sample.figure": "/assets/sample-figure.svg",
  "sample.figure.eps-converted-to.pdf": "/assets/sample-figure.svg",
};

const STORAGE_KEY = "arionear-projects";
const DEFAULT_MAIN_FILE = "main.tex";

export const SAMPLE_LATEX = `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage[a4paper, margin=2.5cm]{geometry}

\\title{Lightweight Adapters for Biomedical NER}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
We present a transformer-based pipeline for low-resource biomedical named entity recognition.
Our approach combines contrastive pre-training with adapter-based fine-tuning.
\\end{abstract}

\\section{Introduction}
Biomedical NER remains challenging because labeled corpora are small and terminology is dense.
Prior work has shown that domain-adaptive pre-training helps, but it is computationally heavy.

\\section{Methods}
We use PubMedBERT as the backbone. Adapters are inserted in every transformer block with bottleneck dimension 64.

\\section{Results}
On BC5CDR-Chemical we obtain F1 of 92.4, on NCBI-Disease 88.1, and on JNLPBA 78.6.

\\section{Conclusion}
Adapter-based fine-tuning with contrastive warm-up is a practical recipe for low-resource biomedical NER.

\\end{document}`;

export const BLANK_LATEX = `\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}

% Core packages
\\usepackage{amsmath, amssymb}
\\usepackage{tikz-cd}
\\usepackage{multicol}

% Paragraphs
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{1\\baselineskip}

\\title{Untitled}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}

\\end{document}`;

function readAll(): StoredProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredProject[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeProject);
  } catch {
    return [];
  }
}

function writeAll(projects: StoredProject[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function normalizeProject(project: StoredProject): StoredProject {
  const mainFile = project.mainFile ?? DEFAULT_MAIN_FILE;
  const files =
    project.files?.length
      ? project.files.map((f) => ({ path: normalizeAssetName(f.path), content: f.content }))
      : [{ path: mainFile, content: project.latex }];

  const mainContent = files.find((f) => f.path === mainFile)?.content ?? files[0]?.content ?? project.latex;

  return {
    ...project,
    mainFile,
    compiler: project.compiler ?? "auto",
    files,
    latex: mainContent,
  };
}

export function getProjects(): StoredProject[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): StoredProject | null {
  const project = readAll().find((p) => p.id === id);
  return project ? normalizeProject(project) : null;
}

export function createProject(
  name: string,
  latex: string,
  options?: {
    files?: ProjectFile[];
    mainFile?: string;
    compiler?: LatexCompiler;
    assets?: ProjectAsset[];
  },
): StoredProject {
  const now = Date.now();
  const mainFile = options?.mainFile ?? DEFAULT_MAIN_FILE;
  const files = options?.files?.length
    ? options.files.map((f) => ({ path: normalizeAssetName(f.path), content: f.content }))
    : [{ path: mainFile, content: latex }];

  const project: StoredProject = normalizeProject({
    id: crypto.randomUUID(),
    name,
    latex,
    files,
    mainFile,
    compiler: options?.compiler ?? "auto",
    assets: options?.assets,
    createdAt: now,
    updatedAt: now,
  });

  const projects = readAll();
  projects.unshift(project);
  writeAll(projects);
  return project;
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

export function resolveProjectAsset(src: string, assets: ProjectAsset[] = []): string | null {
  const key = normalizeAssetName(src);
  const basename = key.split("/").pop() ?? key;
  const stem = basename.replace(/\.[^.]+$/, "");

  const candidates = [
    key,
    basename,
    `${stem}.png`,
    `${stem}.jpg`,
    `${stem}.jpeg`,
    `${stem}.pdf`,
    `${stem}.svg`,
    `${stem}.eps-converted-to.pdf`,
  ];

  for (const candidate of candidates) {
    const match = assets.find(
      (asset) => normalizeAssetName(asset.name).toLowerCase() === candidate.toLowerCase(),
    );
    if (match) return match.dataUrl;

    const suffixMatch = assets.find((asset) => {
      const assetName = normalizeAssetName(asset.name).toLowerCase();
      return assetName.endsWith(`/${candidate.toLowerCase()}`) || assetName === candidate.toLowerCase();
    });
    if (suffixMatch) return suffixMatch.dataUrl;
  }

  const builtin =
    BUILTIN_ASSET_URLS[basename] ??
    BUILTIN_ASSET_URLS[key] ??
    BUILTIN_ASSET_URLS[`${stem}.eps`];
  return builtin ?? null;
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

export function addProjectAssets(projectId: string, newAssets: ProjectAsset[]) {
  const projects = readAll();
  const index = projects.findIndex((p) => p.id === projectId);
  if (index === -1) return null;

  const existing = projects[index].assets ?? [];
  const merged = [...existing];

  for (const asset of newAssets) {
    const normalized = normalizeAssetName(asset.name);
    const existingIndex = merged.findIndex(
      (item) => normalizeAssetName(item.name).toLowerCase() === normalized.toLowerCase(),
    );
    const next = { ...asset, name: normalized };
    if (existingIndex >= 0) merged[existingIndex] = next;
    else merged.push(next);
  }

  projects[index] = normalizeProject({
    ...projects[index],
    assets: merged,
    updatedAt: Date.now(),
  });
  writeAll(projects);
  return projects[index];
}

export function updateProject(
  id: string,
  patch: Partial<Pick<StoredProject, "name" | "latex" | "assets" | "files" | "mainFile" | "compiler">>,
) {
  const projects = readAll();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const current = normalizeProject(projects[index]);
  const mainFile = patch.mainFile ?? current.mainFile ?? DEFAULT_MAIN_FILE;
  let files = patch.files ?? current.files ?? [{ path: mainFile, content: current.latex }];

  if (patch.latex !== undefined && !patch.files) {
    files = files.map((f) => (f.path === mainFile ? { ...f, content: patch.latex! } : f));
    if (!files.some((f) => f.path === mainFile)) {
      files = [...files, { path: mainFile, content: patch.latex }];
    }
  }

  const mainContent = files.find((f) => f.path === mainFile)?.content ?? patch.latex ?? current.latex;

  projects[index] = normalizeProject({
    ...current,
    ...patch,
    files,
    mainFile,
    latex: mainContent,
    updatedAt: Date.now(),
  });
  writeAll(projects);
  return projects[index];
}

export function updateProjectFile(projectId: string, path: string, content: string) {
  const projects = readAll();
  const index = projects.findIndex((p) => p.id === projectId);
  if (index === -1) return null;

  const current = normalizeProject(projects[index]);
  const normalizedPath = normalizeAssetName(path);
  const files = [...(current.files ?? [])];
  const fileIndex = files.findIndex((f) => f.path === normalizedPath);
  if (fileIndex >= 0) files[fileIndex] = { path: normalizedPath, content };
  else files.push({ path: normalizedPath, content });

  const mainFile = current.mainFile ?? DEFAULT_MAIN_FILE;
  const latex = normalizedPath === mainFile ? content : current.latex;

  projects[index] = normalizeProject({
    ...current,
    files,
    latex,
    updatedAt: Date.now(),
  });
  writeAll(projects);
  return projects[index];
}

export function deleteProject(id: string) {
  writeAll(readAll().filter((p) => p.id !== id));
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

export function getCompilePayload(project: StoredProject) {
  const normalized = normalizeProject(project);
  const mainFile = normalized.mainFile ?? DEFAULT_MAIN_FILE;
  const mainContent =
    normalized.files?.find((f) => f.path === mainFile)?.content ?? normalized.latex;

  const texAssets =
    normalized.files
      ?.filter((f) => f.path !== mainFile && isTexFile(f.path))
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
