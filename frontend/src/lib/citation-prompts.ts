export function buildCitationFixPrompt(key?: string): string {
  if (key?.trim()) {
    return `/edit Đề xuất sửa mục bibliography cho \\cite{${key.trim()}} — bổ sung metadata/DOI nếu thiếu`;
  }
  return "/citation Kiểm tra trích dẫn và đề xuất sửa các mục chưa xác minh";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Line number (1-based) of the first \\cite{...key...} or bibliography @key entry. */
export function findCiteKeyLine(latex: string, key: string): number | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const escaped = escapeRegExp(trimmed);
  const citePattern = new RegExp(`\\\\cite[a-z]*\\*?\\{[^}]*\\b${escaped}\\b`);
  const bibPattern = new RegExp(`@\\w+\\s*\\{\\s*${escaped}\\s*[,\\}]`, "i");
  const lines = latex.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (citePattern.test(line) || bibPattern.test(line)) {
      return i + 1;
    }
  }
  return null;
}
