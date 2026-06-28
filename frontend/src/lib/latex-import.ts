import {
  detectMainTexFile,
  inferProjectName,
  isBibFile,
  isBinaryProjectAsset,
  isImageAssetFile,
  isTexFile,
  normalizeAssetName,
  readFileAsDataUrl,
  readFileAsText,
  type LatexCompiler,
  type ProjectAsset,
  type ProjectFile,
} from "@/lib/project-store";

export type LatexImportResult = {
  name: string;
  files: ProjectFile[];
  mainFile: string;
  assets: ProjectAsset[];
  compiler: LatexCompiler;
};

export function fileRelativePath(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.trim();
  return normalizeAssetName(relative || file.name);
}

export function detectCompilerFromSource(source: string): LatexCompiler {
  const lowered = source.toLowerCase();
  if (lowered.includes("fontspec") || lowered.includes("polyglossia")) return "xelatex";
  if (lowered.includes("unicode-math")) return "lualatex";
  return "auto";
}

export function findMainTexFile(files: ProjectFile[]): string {
  const withClass = files.find((f) => /\\documentclass/.test(f.content));
  if (withClass) return withClass.path;
  return detectMainTexFile(files.map((f) => f.path));
}

export function mergeProjectFiles(existing: ProjectFile[], incoming: ProjectFile[]): ProjectFile[] {
  const merged = existing.map((file) => ({ ...file }));
  for (const file of incoming) {
    const idx = merged.findIndex((item) => item.path === file.path);
    if (idx >= 0) merged[idx] = file;
    else merged.push(file);
  }
  return merged;
}

export function mergeProjectAssets(existing: ProjectAsset[], incoming: ProjectAsset[]): ProjectAsset[] {
  const merged = existing.map((asset) => ({ ...asset }));
  for (const asset of incoming) {
    const normalized = normalizeAssetName(asset.name);
    const idx = merged.findIndex(
      (item) => normalizeAssetName(item.name).toLowerCase() === normalized.toLowerCase(),
    );
    const next = { ...asset, name: normalized };
    if (idx >= 0) merged[idx] = next;
    else merged.push(next);
  }
  return merged;
}

function shouldImportPath(path: string): boolean {
  const normalized = normalizeAssetName(path);
  if (!normalized || normalized.startsWith("__MACOSX/")) return false;
  if (isTexFile(normalized)) return true;
  if (isBibFile(normalized)) return true;
  if (isBinaryProjectAsset(normalized)) return true;
  if (isImageAssetFile(normalized)) return true;
  return normalized.includes("/figures/") || normalized.includes("/images/");
}

export async function importLatexFileList(
  files: File[],
  options?: { fallbackName?: string },
): Promise<LatexImportResult> {
  const texFiles: ProjectFile[] = [];
  const assets: ProjectAsset[] = [];

  for (const file of files) {
    const path = fileRelativePath(file);
    if (!shouldImportPath(path)) continue;

    if (isTexFile(path) || isBibFile(path)) {
      texFiles.push({ path, content: await readFileAsText(file) });
      continue;
    }

    const asset = await readFileAsDataUrl(file);
    assets.push({ ...asset, name: path });
  }

  if (!texFiles.length) {
    throw new Error("Không tìm thấy file .tex. Hãy chọn ít nhất một file LaTeX chính.");
  }

  const mainFile = findMainTexFile(texFiles);
  const mainContent = texFiles.find((f) => f.path === mainFile)?.content ?? texFiles[0].content;

  return {
    name: inferProjectName(mainContent, options?.fallbackName ?? "Imported Project"),
    files: texFiles,
    mainFile,
    assets,
    compiler: detectCompilerFromSource(mainContent),
  };
}
