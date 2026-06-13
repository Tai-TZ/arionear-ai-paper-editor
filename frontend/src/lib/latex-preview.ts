import { createElement, Fragment, type ReactNode } from "react";

export type PreviewBlock =
  | { type: "title"; text: string }
  | { type: "author"; text: string }
  | { type: "date"; text: string }
  | { type: "abstract"; text: string }
  | { type: "section"; title: string; numbered: boolean; number: number }
  | { type: "subsection"; title: string; numbered: boolean; number: number }
  | { type: "paragraph"; text: string }
  | { type: "figure"; src?: string; caption?: string; number: number }
  | { type: "equation"; text: string };

export type PreviewFontProfile = "latin-modern" | "times";
export type PreviewLayout = "article" | "ieee";

export type ParsedLatexPreview = {
  blocks: PreviewBlock[];
  hasDocument: boolean;
  fontProfile: PreviewFontProfile;
  layout: PreviewLayout;
};

function stripComments(latex: string) {
  return latex.replace(/%.*$/gm, "");
}

function extractBalancedBracesContent(source: string, openIndex: number): string | null {
  if (source[openIndex] !== "{") return null;
  let depth = 0;
  for (let j = openIndex; j < source.length; j += 1) {
    if (source[j] === "{") depth += 1;
    if (source[j] === "}") depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, j);
  }
  return null;
}

function unescapeLatex(text: string) {
  return text
    .replace(/\\textbackslash\{\}/g, "\\")
    .replace(/\\textbackslash/g, "\\")
    .replace(/\\\\/g, "\n")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\#/g, "#")
    .replace(/\\$/g, "$")
    .replace(/\\textasciitilde\{\}/g, "~")
    .replace(/\\textasciicircum\{\}/g, "^")
    .replace(/\\~/g, "~")
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\:/g, " ")
    .replace(/\\ /g, " ")
    .replace(/\\-/g, "")
    .replace(/\\ldots/g, "…")
    .replace(/\\dots/g, "…")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/``/g, "\u201c")
    .replace(/''/g, "\u201d")
    .replace(/`/g, "\u2018")
    .replace(/'/g, "\u2019")
    .trim();
}

function extractCommandValue(source: string, command: string) {
  const re = new RegExp(`\\\\${command}\\*?`);
  const match = re.exec(source);
  if (!match) return null;
  let i = match.index + match[0].length;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  if (source[i] !== "{") return null;
  const inner = extractBalancedBracesContent(source, i);
  return inner != null ? unescapeLatex(inner) : null;
}

function formatPreviewDate(raw: string | null) {
  if (!raw || raw === "\\today" || raw.includes("\\today")) {
    return new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  return unescapeLatex(raw.replace(/\\today/g, formatPreviewDate("\\today")));
}

function formatTabularBlock(block: string): string {
  const inner = block
    .replace(/\\begin\{tabular\*?\}\{[^}]*\}/, "")
    .replace(/\\end\{tabular\*?\}/, "");
  return inner
    .split(/\\\\/)
    .map((row) =>
      row
        .split("&")
        .map((cell) => cleanInlineText(cell.trim()))
        .filter(Boolean)
        .join("   "),
    )
    .filter(Boolean)
    .join("\n");
}

function cleanInlineText(text: string) {
  return cleanBodyText(text).replace(/\n+/g, " ").trim();
}

function formatAuthorContent(raw: string): string {
  let text = raw
    .replace(/\\IEEEauthorblockN\{([^}]*)\}/g, (_, name: string) => `${cleanInlineText(name)}\n`)
    .replace(/\\IEEEauthorblockA\{([^}]*)\}/g, (_, affil: string) => `${cleanInlineText(affil)}\n`)
    .replace(/\\thanks\{[^}]*\}/g, "")
    .replace(/\\begin\{tabular\*?\}[\s\S]*?\\end\{tabular\*?\}/g, (block) => formatTabularBlock(block))
    .replace(/\\and\b/g, "\n")
    .replace(/\\$/g, "");

  return cleanInlineText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function cleanBodyText(text: string) {
  return text
    .replace(/\\maketitle/g, "")
    .replace(/\\tableofcontents/g, "")
    .replace(/\\newpage/g, "\n\n")
    .replace(/\\clearpage/g, "\n\n")
    .replace(/\\pagebreak/g, "\n\n")
    .replace(/\\label\{[^}]*\}/g, "")
    .replace(/\\ref\{[^}]*\}/g, "[ref]")
    .replace(/\\cite[p]?\{[^}]*\}/g, "[cite]")
    .replace(/\\footnote\{([^}]*)\}/g, " ($1)")
    .replace(/\\thanks\{[^}]*\}/g, "")
    .replace(/\\IEEEauthorblockN\{([^}]*)\}/g, "$1")
    .replace(/\\IEEEauthorblockA\{([^}]*)\}/g, "$1")
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, "")
    .replace(/\\begin\{figure\*?\}[\s\S]*?\\end\{figure\*?\}/g, "\n[Figure]\n")
    .replace(/\\begin\{table\*?\}[\s\S]*?\\end\{table\*?\}/g, "\n[Table]\n")
    .replace(/\\begin\{tabular\*?\}[\s\S]*?\\end\{tabular\*?\}/g, "\n")
    .replace(/\\begin\{IEEEkeywords\}[\s\S]*?\\end\{IEEEkeywords\}/g, "")
    .replace(/\\begin\{(equation|align|gather|multline)\*?\}([\s\S]*?)\\end\{\1\*?\}/g, "\n[Equation]\n")
    .replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, items: string) =>
      items
        .split(/\\item/g)
        .slice(1)
        .map((item) => `• ${cleanInlineText(item.trim())}`)
        .join("\n"),
    )
    .replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, items: string) =>
      items
        .split(/\\item/g)
        .slice(1)
        .map((item, i) => `${i + 1}. ${cleanInlineText(item.trim())}`)
        .join("\n"),
    )
    .replace(/\\begin\{verbatim\}[\s\S]*?\\end\{verbatim\}/g, "")
    .replace(/\\begin\{lstlisting\}[\s\S]*?\\end\{lstlisting\}/g, "")
    .replace(/\\vspace\{[^}]*\}/g, "")
    .replace(/\\hspace\{[^}]*\}/g, "")
    .replace(/\\noindent/g, "")
    .replace(/\\centering/g, "")
    .replace(/\\raggedright/g, "")
    .replace(/\\raggedleft/g, "")
    .replace(/\\textbf\{([^}]*)\}/g, "**$1**")
    .replace(/\\textit\{([^}]*)\}/g, "_$1_")
    .replace(/\\emph\{([^}]*)\}/g, "_$1_")
    .replace(/\\texttt\{([^}]*)\}/g, "`$1`")
    .replace(/\\url\{([^}]*)\}/g, "$1")
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, "$1")
    .replace(/\$([^$]+)\$/g, " $1 ")
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((p) => unescapeLatex(p.replace(/\n/g, " ").replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

type ParsedFigure = {
  src?: string;
  caption?: string;
};

function parseFigureInner(inner: string): ParsedFigure {
  const includegraphics = inner.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/);
  const epsfig = inner.match(/\\epsfig\{([^}]*)\}/);
  let src: string | undefined;

  if (includegraphics) {
    src = unescapeLatex(includegraphics[1]);
  } else if (epsfig) {
    const fileMatch = epsfig[1].match(/file=([^,\s}]+)/);
    if (fileMatch) src = unescapeLatex(fileMatch[1]);
  }

  const captionMatch = inner.match(/\\caption(?:\[[^\]]*\])?\{([^}]*)\}/);
  return {
    src,
    caption: captionMatch ? unescapeLatex(captionMatch[1]) : undefined,
  };
}

function stripLatexFormatting(text: string): string {
  let t = unescapeLatex(text);
  for (let pass = 0; pass < 3; pass += 1) {
    t = t
      .replace(/\\textbf\{([^{}]*)\}/g, "$1")
      .replace(/\\textit\{([^{}]*)\}/g, "$1")
      .replace(/\\emph\{([^{}]*)\}/g, "$1")
      .replace(/\\texttt\{([^{}]*)\}/g, "$1");
  }
  return t.replace(/\s+/g, " ").trim();
}

function parseHeading(line: string) {
  const section = line.match(/^\\(section|subsection)\*?/);
  if (!section) return null;

  const cmd = section[1] as "section" | "subsection";
  const braceStart = line.indexOf("{");
  if (braceStart < 0) return null;

  const titleRaw = extractBalancedBracesContent(line, braceStart);
  if (titleRaw == null) return null;

  return {
    type: cmd,
    title: stripLatexFormatting(titleRaw),
    starred: line.includes(`\\${cmd}*`),
  };
}

function readHeadingToken(body: string, start: number): { token: string; end: number } | null {
  const match = body.slice(start).match(/^\\(section|subsection)\*?\{/);
  if (!match) return null;

  const braceStart = start + match[0].length - 1;
  const content = extractBalancedBracesContent(body, braceStart);
  if (content == null) return null;

  const end = braceStart + content.length + 2;
  return { token: body.slice(start, end), end };
}

function splitBodyTokens(body: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < body.length) {
    const marker = body.slice(i).match(/^<<FIGURE:\d+>>|^<<TABLE>>|^<<EQUATION>>/);
    if (marker) {
      tokens.push(marker[0]);
      i += marker[0].length;
      continue;
    }

    const heading = readHeadingToken(body, i);
    if (heading) {
      tokens.push(heading.token);
      i = heading.end;
      continue;
    }

    let j = i + 1;
    while (j < body.length) {
      if (body.slice(j).match(/^<<FIGURE:\d+>>|^<<TABLE>>|^<<EQUATION>>/)) break;
      if (readHeadingToken(body, j)) break;
      j += 1;
    }

    const chunk = body.slice(i, j).trim();
    if (chunk) tokens.push(chunk);
    i = j;
  }

  return tokens;
}

function toRomanNumeral(value: number): string {
  const numerals: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let n = value;
  let out = "";
  for (const [num, sym] of numerals) {
    while (n >= num) {
      out += sym;
      n -= num;
    }
  }
  return out;
}

/** Map LaTeX preamble to preview serif — CM default; IEEE/Times packages → Times. */
export function detectPreviewFontProfile(latex: string): PreviewFontProfile {
  const preamble = stripComments(latex).split("\\begin{document}")[0] ?? latex;

  const usesIeee =
    /\\documentclass(?:\[[^\]]*\])?\{IEEEtran\}/i.test(preamble) ||
    /\\usepackage(?:\[[^\]]*\])?\{IEEEtran\}/i.test(preamble);

  const usesTimes =
    /\\usepackage(?:\[[^\]]*\])?\{times\}/.test(preamble) ||
    /\\usepackage(?:\[[^\]]*\])?\{mathptmx\}/.test(preamble) ||
    /\\usepackage(?:\[[^\]]*\])?\{newtxtext\}/.test(preamble) ||
    /\\usepackage(?:\[[^\]]*\])?\{tgtermes\}/.test(preamble) ||
    /\\usepackage(?:\[[^\]]*\])?\{ptm\}/.test(preamble);

  if (usesIeee || usesTimes) return "times";
  return "latin-modern";
}

export function detectPreviewLayout(latex: string): PreviewLayout {
  const preamble = stripComments(latex).split("\\begin{document}")[0] ?? latex;
  if (/\\documentclass(?:\[[^\]]*\])?\{IEEEtran\}/i.test(preamble)) return "ieee";
  return "article";
}

export function parseLatexPreview(latex: string): ParsedLatexPreview {
  const source = stripComments(latex);
  const hasDocument = /\\begin\{document\}/.test(source);
  const preamble = source.split("\\begin{document}")[0] ?? source;
  const rawBody = source.split("\\begin{document}")[1]?.split("\\end{document}")[0] ?? source;
  const layout = detectPreviewLayout(source);

  const blocks: PreviewBlock[] = [];
  const title = extractCommandValue(preamble + rawBody, "title");
  const authorRaw = extractCommandValue(preamble + rawBody, "author");
  const dateRaw = extractCommandValue(preamble + rawBody, "date");

  if (title) blocks.push({ type: "title", text: cleanInlineText(title) });
  if (authorRaw) blocks.push({ type: "author", text: formatAuthorContent(authorRaw) });
  if (title || authorRaw || dateRaw) {
    blocks.push({ type: "date", text: formatPreviewDate(dateRaw) });
  }

  let body = rawBody;
  const abstractMatch = body.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
  if (abstractMatch) {
    blocks.push({ type: "abstract", text: cleanBodyText(abstractMatch[1]) });
    body = body.replace(abstractMatch[0], "");
  }

  const figureData: ParsedFigure[] = [];
  let figureNumber = 0;

  const markFigure = (data: ParsedFigure) => {
    figureNumber += 1;
    figureData.push(data);
    return `\n<<FIGURE:${figureNumber - 1}>>\n`;
  };

  body = body
    .replace(/\\maketitle/g, "")
    .replace(/\\tableofcontents/g, "")
    .replace(/\\begin\{IEEEkeywords\}[\s\S]*?\\end\{IEEEkeywords\}/g, "")
    .replace(/\\begin\{figure\*?\}([\s\S]*?)\\end\{figure\*?\}/g, (_, inner: string) =>
      markFigure(parseFigureInner(inner)),
    )
    .replace(/\\begin\{table\*?\}[\s\S]*?\\end\{table\*?\}/g, "\n<<TABLE>>\n")
    .replace(/\\begin\{tabular\*?\}[\s\S]*?\\end\{tabular\*?\}/g, "\n")
    .replace(/\\begin\{(equation|align|gather|multline)\*?\}[\s\S]*?\\end\{\1\*?\}/g, "\n<<EQUATION>>\n")
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g, (_, src: string) =>
      markFigure({ src: unescapeLatex(src) }),
    )
    .replace(/\\epsfig\{([^}]*)\}/g, (_, args: string) => markFigure(parseFigureInner(`\\epsfig{${args}}`)));

  const tokens = splitBodyTokens(body);

  let sectionNumber = 0;
  let subsectionNumber = 0;
  let renderedFigureNumber = 0;

  for (const token of tokens) {
    const heading = parseHeading(token.trim());
    if (heading) {
      if (heading.type === "section") {
        if (!heading.starred) sectionNumber += 1;
        subsectionNumber = 0;
        const titleText =
          layout === "ieee" ? heading.title.toUpperCase() : heading.title;
        blocks.push({
          type: "section",
          title: titleText,
          numbered: !heading.starred,
          number: sectionNumber,
        });
      } else {
        if (!heading.starred) subsectionNumber += 1;
        blocks.push({
          type: "subsection",
          title: heading.title,
          numbered: !heading.starred,
          number: subsectionNumber,
        });
      }
      continue;
    }

    const figureToken = token.match(/^<<FIGURE:(\d+)>>$/);
    if (figureToken) {
      const data = figureData[Number(figureToken[1])];
      if (data) {
        renderedFigureNumber += 1;
        blocks.push({
          type: "figure",
          src: data.src,
          caption: data.caption,
          number: renderedFigureNumber,
        });
      }
      continue;
    }

    if (token === "<<TABLE>>") {
      renderedFigureNumber += 1;
      blocks.push({ type: "figure", caption: "Table", number: renderedFigureNumber });
      continue;
    }

    if (token === "<<EQUATION>>") {
      blocks.push({ type: "equation", text: "…" });
      continue;
    }

    const cleaned = cleanBodyText(token);
    splitParagraphs(cleaned).forEach((text) => {
      blocks.push({ type: "paragraph", text });
    });
  }

  if (blocks.length === 0) {
    const fallback = cleanBodyText(rawBody || source);
    splitParagraphs(fallback).forEach((text) => {
      blocks.push({ type: "paragraph", text });
    });
  }

  return { blocks, hasDocument, fontProfile: detectPreviewFontProfile(source), layout };
}

export function formatSectionLabel(
  block: Extract<PreviewBlock, { type: "section" | "subsection" }>,
  layout: PreviewLayout,
): string {
  if (!block.numbered) return block.title;
  if (layout === "ieee" && block.type === "section") {
    return `${toRomanNumeral(block.number)}. ${block.title}`;
  }
  if (block.type === "subsection") {
    return `${block.number}. ${block.title}`;
  }
  return `${block.number} ${block.title}`;
}

let inlineKey = 0;

function renderStyledText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `inline-${inlineKey++}`;

    if (token.startsWith("**")) {
      nodes.push(createElement("strong", { key }, token.slice(2, -2)));
    } else if (token.startsWith("_")) {
      nodes.push(createElement("em", { key }, token.slice(1, -1)));
    } else if (token.startsWith("`")) {
      nodes.push(
        createElement(
          "code",
          { key, className: "preview-inline-code" },
          token.slice(1, -1),
        ),
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length ? nodes : [text];
}

export function renderPreviewParagraph(text: string) {
  return createElement(Fragment, null, ...renderStyledText(text));
}
