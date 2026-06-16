/**
 * Import Overleaf project ZIP exports (multi-file + assets).
 * Zero-dependency: uses native DecompressionStream for deflate ZIP entries.
 */

import {
  detectMainTexFile,
  inferProjectName,
  isBinaryProjectAsset,
  isTexFile,
  normalizeAssetName,
  type LatexCompiler,
  type ProjectAsset,
  type ProjectFile,
} from "@/lib/project-store";

export type OverleafImportResult = {
  name: string;
  files: ProjectFile[];
  mainFile: string;
  assets: ProjectAsset[];
  compiler: LatexCompiler;
};

function detectCompilerFromSource(source: string): LatexCompiler {
  const lowered = source.toLowerCase();
  if (lowered.includes("fontspec") || lowered.includes("polyglossia")) return "xelatex";
  if (lowered.includes("unicode-math")) return "lualatex";
  return "auto";
}

function findMainFile(files: ProjectFile[]): string {
  const withClass = files.find((f) => /\\documentclass/.test(f.content));
  if (withClass) return withClass.path;
  return detectMainTexFile(files.map((f) => f.path));
}

async function inflateDeflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Trình duyệt không hỗ trợ giải nén ZIP (deflate).");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function parseZipArchive(data: Uint8Array): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  while (offset + 30 <= data.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;

    const compMethod = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const uncompSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameBytes = data.slice(offset + 30, offset + 30 + nameLen);
    const name = normalizeAssetName(new TextDecoder().decode(nameBytes));
    const dataStart = offset + 30 + nameLen + extraLen;
    const raw = data.slice(dataStart, dataStart + compSize);

    if (name && !name.endsWith("/") && !name.startsWith("__MACOSX")) {
      if (compMethod === 0) {
        entries.set(name, raw.slice(0, uncompSize || raw.length));
      } else if (compMethod === 8) {
        entries.set(name, await inflateDeflateRaw(raw));
      }
    }

    offset = dataStart + compSize;
  }

  return entries;
}

async function loadZipEntries(file: File): Promise<Map<string, Uint8Array>> {
  const buffer = await file.arrayBuffer();
  return parseZipArchive(new Uint8Array(buffer));
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

export async function importOverleafZip(file: File): Promise<OverleafImportResult> {
  const entries = await loadZipEntries(file);
  const files: ProjectFile[] = [];
  const assets: ProjectAsset[] = [];

  for (const [path, bytes] of entries) {
    if (isTexFile(path)) {
      const content = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      files.push({ path, content });
      continue;
    }
    if (isBinaryProjectAsset(path) || path.includes("/figures/") || path.includes("/images/")) {
      assets.push({
        name: path,
        mimeType: guessMime(path),
        dataUrl: bytesToDataUrl(bytes, guessMime(path)),
      });
    }
  }

  if (!files.length) {
    throw new Error("ZIP không chứa file .tex. Hãy export project từ Overleaf dạng ZIP.");
  }

  const mainFile = findMainFile(files);
  const mainContent = files.find((f) => f.path === mainFile)?.content ?? files[0].content;

  return {
    name: inferProjectName(mainContent, file.name.replace(/\.zip$/i, "")),
    files,
    mainFile,
    assets,
    compiler: detectCompilerFromSource(mainContent),
  };
}
