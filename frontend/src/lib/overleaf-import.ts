/**
 * Import Overleaf project ZIP exports (multi-file + assets).
 * Uses fflate for standards-compliant ZIP parsing (data descriptors, central directory).
 */

import { unzip } from "fflate";
import {
  detectCompilerFromSource,
  findMainTexFile,
  type LatexImportResult,
} from "@/lib/latex-import";
import {
  inferProjectName,
  isBinaryProjectAsset,
  isBibFile,
  isImageAssetFile,
  isLatexSupportAssetFile,
  isTexFile,
  normalizeAssetName,
  type ProjectAsset,
  type ProjectFile,
} from "@/lib/project-store";

export type OverleafImportResult = LatexImportResult;

/** Overleaf / LaTeX build artifacts — skip on import. */
const SKIP_PATH_RE =
  /(?:^|\/)(?:output\.(?:pdf|log|aux|bbl|blg|fls|fdb_latexmk|synctex\.gz)|\.DS_Store|Thumbs\.db|__MACOSX)(?:\/|$)|\.(?:aux|log|out|toc|lof|lot|fls|fdb_latexmk|synctex\.gz|nav|snm|vrb|bcf|run\.xml|blg|bbl)$/i;

export const MAX_OVERLEAF_ZIP_BYTES = 80 * 1024 * 1024;

function shouldSkipPath(path: string): boolean {
  return SKIP_PATH_RE.test(path);
}

function shouldImportAssetPath(path: string): boolean {
  if (shouldSkipPath(path)) return false;
  if (isImageAssetFile(path)) return true;
  if (isBinaryProjectAsset(path)) return true;
  return /(?:^|\/)(figures?|images?|img|pics?|photos?|graphic|assets?)\//i.test(path);
}

function addBinaryAsset(
  assets: ProjectAsset[],
  path: string,
  bytes: Uint8Array,
  seen: Set<string>,
) {
  const normalized = normalizeAssetName(path);
  const key = normalized.toLowerCase();
  if (!normalized || seen.has(key)) return;
  seen.add(key);
  assets.push({
    name: normalized,
    mimeType: guessMime(normalized),
    dataUrl: bytesToDataUrl(bytes, guessMime(normalized)),
  });
}

function stripCommonRootPrefix(paths: string[]): Map<string, string> {
  const remapped = new Map<string, string>();
  for (const original of paths) {
    remapped.set(original, normalizeAssetName(original));
  }

  while (true) {
    const values = [...remapped.values()].filter(Boolean);
    const segments = values.map((value) => value.split("/"));
    if (segments.every((parts) => parts.length <= 1)) break;

    const first = segments[0]?.[0] ?? "";
    if (!first || !segments.every((parts) => parts.length > 1 && parts[0] === first)) {
      break;
    }

    for (const [original, value] of remapped) {
      remapped.set(original, normalizeAssetName(value.split("/").slice(1).join("/")));
    }
  }

  return remapped;
}

function isLikelyText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  for (const byte of sample) {
    if (byte === 0) return false;
  }
  return true;
}

function looksLikeLatexSource(content: string): boolean {
  const sample = content.slice(0, 12_000);
  if (/\\documentclass[\s*{[]/i.test(sample)) return true;
  if (/\\begin\{document\}/i.test(sample)) return true;
  if (/\\(input|include|usepackage|section|chapter|subsection)\b/i.test(sample) && sample.trim().length > 30) {
    return true;
  }
  return false;
}

function isTexLikePath(path: string): boolean {
  return isTexFile(path) || /\.(ltx|dtx)$/i.test(path);
}

function ensureTexPath(path: string): string {
  if (isTexLikePath(path)) return path;
  const base = path.split("/").pop() ?? path;
  if (base.includes(".")) return path;
  return `${path}.tex`;
}

async function loadZipEntries(file: File): Promise<Map<string, Uint8Array>> {
  if (file.size > MAX_OVERLEAF_ZIP_BYTES) {
    throw new Error(
      `ZIP quá lớn (${Math.round(file.size / (1024 * 1024))} MB). Giới hạn ${Math.round(MAX_OVERLEAF_ZIP_BYTES / (1024 * 1024))} MB.`,
    );
  }

  const buffer = await file.arrayBuffer();
  const raw = new Uint8Array(buffer);

  const entries = await new Promise<Map<string, Uint8Array>>((resolve, reject) => {
    unzip(raw, (error, data) => {
      if (error) {
        reject(
          new Error(
            "Không đọc được ZIP. Hãy export từ Overleaf: Menu → Download → Source (ZIP).",
          ),
        );
        return;
      }

      const map = new Map<string, Uint8Array>();
      for (const [path, bytes] of Object.entries(data)) {
        const normalized = normalizeAssetName(path);
        if (!normalized || normalized.endsWith("/") || shouldSkipPath(normalized)) continue;
        map.set(normalized, bytes);
      }
      resolve(map);
    });
  });

  return expandNestedZipEntries(entries);
}

async function expandNestedZipEntries(entries: Map<string, Uint8Array>): Promise<Map<string, Uint8Array>> {
  const expanded = new Map(entries);
  const nested = [...entries.entries()].filter(([path]) => /\.zip$/i.test(path));

  for (const [zipPath, bytes] of nested) {
    const folder = zipPath.replace(/\.zip$/i, "");
    await new Promise<void>((resolve, reject) => {
      unzip(bytes, (error, inner) => {
        if (error) {
          resolve();
          return;
        }
        for (const [innerPath, innerBytes] of Object.entries(inner)) {
          const normalized = normalizeAssetName(innerPath);
          if (!normalized || normalized.endsWith("/") || shouldSkipPath(normalized)) continue;
          const target = folder ? `${folder}/${normalized}` : normalized;
          expanded.set(target, innerBytes);
        }
        resolve();
      });
    });
    expanded.delete(zipPath);
  }

  return expanded;
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function guessMime(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".eps": "application/postscript",
    ".bib": "application/x-bibtex",
    ".cls": "text/plain",
    ".sty": "text/plain",
    ".bst": "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

function decodeTex(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function importOverleafZip(file: File): Promise<OverleafImportResult> {
  const rawEntries = await loadZipEntries(file);
  if (!rawEntries.size) {
    throw new Error("ZIP trống hoặc không có file hợp lệ.");
  }

  const pathMap = stripCommonRootPrefix([...rawEntries.keys()]);
  const files: ProjectFile[] = [];
  const assets: ProjectAsset[] = [];
  const seenFilePaths = new Set<string>();
  const seenAssetPaths = new Set<string>();

  const addTexFile = (path: string, content: string) => {
    const normalizedPath = ensureTexPath(normalizeAssetName(path));
    if (!normalizedPath || seenFilePaths.has(normalizedPath.toLowerCase())) return;
    seenFilePaths.add(normalizedPath.toLowerCase());
    files.push({ path: normalizedPath, content });
  };

  const addTextFile = (path: string, content: string) => {
    const normalizedPath = normalizeAssetName(path);
    if (!normalizedPath || seenFilePaths.has(normalizedPath.toLowerCase())) return;
    seenFilePaths.add(normalizedPath.toLowerCase());
    files.push({ path: normalizedPath, content });
  };

  for (const [rawPath, bytes] of rawEntries) {
    const path = pathMap.get(rawPath) ?? normalizeAssetName(rawPath);
    if (!path || shouldSkipPath(path)) continue;

    if (isTexLikePath(path)) {
      addTexFile(path, decodeTex(bytes));
      continue;
    }

    if (isBibFile(path)) {
      addTextFile(path, decodeTex(bytes));
      continue;
    }

    if (isImageAssetFile(path) || /\.(pdf|eps)$/i.test(path)) {
      addBinaryAsset(assets, path, bytes, seenAssetPaths);
      continue;
    }

    if (isLikelyText(bytes)) {
      const text = decodeTex(bytes);
      if (looksLikeLatexSource(text)) {
        addTexFile(path, text);
        continue;
      }
    }

    if (shouldImportAssetPath(path)) {
      addBinaryAsset(assets, path, bytes, seenAssetPaths);
      continue;
    }

    if (isLatexSupportAssetFile(path)) {
      addBinaryAsset(assets, path, bytes, seenAssetPaths);
    }
  }

  if (!files.length) {
    const discovered = [...pathMap.values()].filter(Boolean).slice(0, 12);
    const preview = discovered.length
      ? ` File tìm thấy: ${discovered.join(", ")}${rawEntries.size > discovered.length ? ", …" : ""}.`
      : "";
    const onlyPdf =
      discovered.length > 0 && discovered.every((name) => /\.pdf$/i.test(name));

    if (onlyPdf) {
      throw new Error(
        `${preview} Đây là ZIP PDF (compiled), không có source .tex. Trên Overleaf: Menu (☰) → Download → Source (ZIP).`,
      );
    }

    throw new Error(
      `${preview} Không thấy file .tex. Hãy export Source (ZIP) từ Overleaf — không phải PDF/ZIP compiled.`,
    );
  }

  const mainFile = findMainTexFile(files);
  const mainContent = files.find((f) => f.path === mainFile)?.content ?? files[0].content;

  return {
    name: inferProjectName(mainContent, file.name.replace(/\.zip$/i, "")),
    files,
    mainFile,
    assets,
    compiler: detectCompilerFromSource(mainContent),
  };
}
