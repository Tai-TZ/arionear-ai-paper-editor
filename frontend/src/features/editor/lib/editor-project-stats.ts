export type ProjectStats = {
  words: number;
  wordsInText: number;
  wordsInHeaders: number;
  wordsOutsideText: number;
  headers: number;
  figures: number;
  mathInlines: number;
  mathDisplayed: number;
};

export function parseCompileErrorLine(error: string): number | undefined {
  const lineMatch = error.match(/:(\d+):/);
  if (lineMatch) return Number.parseInt(lineMatch[1], 10);
  const latexMatch = error.match(/l\.(\d+)/);
  if (latexMatch) return Number.parseInt(latexMatch[1], 10);
  return undefined;
}

export function countDiffStats(original: string, suggestion: string) {
  const o = original.length;
  const s = suggestion.length;
  if (s >= o) return { additions: s - o, deletions: 0 };
  return { additions: 0, deletions: o - s };
}

function stripLatexCommands(source: string) {
  return source
    .replace(/%.*$/gm, "")
    .replace(/\\begin\{document\}[\s\S]*\\end\{document\}/, (block) => block)
    .replace(/\\[a-zA-Z@]+(\[[^\]]*\])?(\{[^{}]*\})?/g, " ")
    .replace(/[{}\\$&%#_^~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string) {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

export function computeProjectStats(latex: string): ProjectStats {
  const preamble = latex.split("\\begin{document}")[0] ?? "";
  const body = latex.split("\\begin{document}")[1]?.split("\\end{document}")[0] ?? latex;

  const headerBlocks = [
    ...(body.match(/\\title\{([^}]*)\}/g) ?? []),
    ...(body.match(/\\author\{([^}]*)\}/g) ?? []),
    ...(body.match(/\\section\*?\{([^}]*)\}/g) ?? []),
    ...(body.match(/\\subsection\*?\{([^}]*)\}/g) ?? []),
  ]
    .map((m) => m.replace(/\\[a-zA-Z@]+\*?\{([^}]*)\}/, "$1"))
    .join(" ");

  const textBody = body
    .replace(/\\title\{[^}]*\}/g, "")
    .replace(/\\author\{[^}]*\}/g, "")
    .replace(/\\date\{[^}]*\}/g, "")
    .replace(/\\maketitle/g, "")
    .replace(/\\section\*?\{[^}]*\}/g, "")
    .replace(/\\subsection\*?\{[^}]*\}/g, "");

  const wordsInHeaders = countWords(stripLatexCommands(headerBlocks));
  const wordsInText = countWords(stripLatexCommands(textBody));
  const wordsOutsideText = countWords(stripLatexCommands(preamble));
  const words = wordsInText + wordsInHeaders + wordsOutsideText;

  return {
    words,
    wordsInText,
    wordsInHeaders,
    wordsOutsideText,
    headers:
      (body.match(/\\section\*?\{/g) ?? []).length +
      (body.match(/\\subsection\*?\{/g) ?? []).length +
      (latex.includes("\\title{") ? 1 : 0),
    figures: (latex.match(/\\includegraphics/g) ?? []).length,
    mathInlines: (latex.match(/(?<!\$)\$(?!\$)[^$]+\$(?!\$)/g) ?? []).length,
    mathDisplayed: (latex.match(/\\begin\{(equation|align|gather|multline)\*?\}/g) ?? []).length,
  };
}
