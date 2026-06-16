export type ProjectAsset = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type StoredProject = {
  id: string;
  name: string;
  latex: string;
  assets?: ProjectAsset[];
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

const BUILTIN_ASSET_URLS: Record<string, string> = {
  "sample.figure.eps": "/assets/sample-figure.svg",
  "sample.figure": "/assets/sample-figure.svg",
  "sample.figure.eps-converted-to.pdf": "/assets/sample-figure.svg",
};

const STORAGE_KEY = "arionear-projects";

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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(projects: StoredProject[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function getProjects(): StoredProject[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): StoredProject | null {
  return readAll().find((p) => p.id === id) ?? null;
}

export function createProject(name: string, latex: string): StoredProject {
  const now = Date.now();
  const project: StoredProject = {
    id: crypto.randomUUID(),
    name,
    latex,
    createdAt: now,
    updatedAt: now,
  };
  const projects = readAll();
  projects.unshift(project);
  writeAll(projects);
  return project;
}

export function isImageAssetFile(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function isLatexSupportAssetFile(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return LATEX_SUPPORT_EXTENSIONS.has(ext);
}

export function isProjectAssetFile(name: string) {
  return isImageAssetFile(name) || isLatexSupportAssetFile(name);
}

export function normalizeAssetName(name: string) {
  return name.replace(/\\/g, "/").replace(/^\.\//, "").trim();
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

  projects[index] = {
    ...projects[index],
    assets: merged,
    updatedAt: Date.now(),
  };
  writeAll(projects);
  return projects[index];
}

export function updateProject(
  id: string,
  patch: Partial<Pick<StoredProject, "name" | "latex" | "assets">>,
) {
  const projects = readAll();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return null;
  projects[index] = {
    ...projects[index],
    ...patch,
    updatedAt: Date.now(),
  };
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

export function formatTimeAgo(timestamp: number) {
  if (!Number.isFinite(timestamp)) return "—";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatProjectDateTime(timestamp);
}

/** Absolute local date/time for project list columns. */
export function formatProjectDateTime(timestamp: number) {
  if (!Number.isFinite(timestamp)) return "—";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
