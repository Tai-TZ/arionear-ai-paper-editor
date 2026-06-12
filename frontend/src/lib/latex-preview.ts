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

export type ParsedLatexPreview = {
  blocks: PreviewBlock[];
  hasDocument: boolean;
};

function stripComments(latex: string) {
  return latex.replace(/%.*$/gm, "");
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
  const re = new RegExp(`\\\\${command}\\*?\\{([^}]*)\\}`);
  const match = source.match(re);
  return match ? unescapeLatex(match[1]) : null;
}

function formatPreviewDate(raw: string | null) {
  if (!raw || raw === "\\today" || raw.includes("\\today")) {
    return new Date().toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return unescapeLatex(raw.replace(/\\today/g, formatPreviewDate("\\today")));
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
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, "")
    .replace(/\\begin\{figure\*?\}[\s\S]*?\\end\{figure\*?\}/g, "\n[Figure]\n")
    .replace(/\\begin\{table\*?\}[\s\S]*?\\end\{table\*?\}/g, "\n[Table]\n")
    .replace(/\\begin\{(equation|align|gather|multline)\*?\}([\s\S]*?)\\end\{\1\*?\}/g, "\n[Equation]\n")
    .replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, items: string) =>
      items
        .split(/\\item/g)
        .slice(1)
        .map((item) => `• ${unescapeLatex(item.trim())}`)
        .join("\n"),
    )
    .replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, items: string) =>
      items
        .split(/\\item/g)
        .slice(1)
        .map((item, i) => `${i + 1}. ${unescapeLatex(item.trim())}`)
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

function parseHeading(line: string) {
  const section = line.match(/^\\section\*?\{([^}]*)\}$/);
  if (section) {
    return {
      type: "section" as const,
      title: unescapeLatex(section[1]),
      starred: line.includes("\\section*"),
    };
  }

  const subsection = line.match(/^\\subsection\*?\{([^}]*)\}$/);
  if (subsection) {
    return {
      type: "subsection" as const,
      title: unescapeLatex(subsection[1]),
      starred: line.includes("\\subsection*"),
    };
  }

  return null;
}

export function parseLatexPreview(latex: string): ParsedLatexPreview {
  const source = stripComments(latex);
  const hasDocument = /\\begin\{document\}/.test(source);
  const preamble = source.split("\\begin{document}")[0] ?? source;
  const rawBody = source.split("\\begin{document}")[1]?.split("\\end{document}")[0] ?? source;

  const blocks: PreviewBlock[] = [];
  const title = extractCommandValue(preamble + rawBody, "title");
  const author = extractCommandValue(preamble + rawBody, "author");
  const dateRaw = extractCommandValue(preamble + rawBody, "date");

  if (title) blocks.push({ type: "title", text: title });
  if (author) blocks.push({ type: "author", text: author });
  if (title || author || dateRaw) {
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
    .replace(/\\begin\{figure\*?\}([\s\S]*?)\\end\{figure\*?\}/g, (_, inner: string) =>
      markFigure(parseFigureInner(inner)),
    )
    .replace(/\\begin\{table\*?\}[\s\S]*?\\end\{table\*?\}/g, "\n<<TABLE>>\n")
    .replace(/\\begin\{(equation|align|gather|multline)\*?\}[\s\S]*?\\end\{\1\*?\}/g, "\n<<EQUATION>>\n")
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g, (_, src: string) =>
      markFigure({ src: unescapeLatex(src) }),
    )
    .replace(/\\epsfig\{([^}]*)\}/g, (_, args: string) => markFigure(parseFigureInner(`\\epsfig{${args}}`)));

  const tokens = body
    .split(
      /(\\section\*?\{[^}]*\}|\\subsection\*?\{[^}]*\}|<<FIGURE:\d+>>|<<TABLE>>|<<EQUATION>>)/,
    )
    .map((part) => part.trim())
    .filter(Boolean);

  let sectionNumber = 0;
  let subsectionNumber = 0;
  let renderedFigureNumber = 0;

  for (const token of tokens) {
    const heading = parseHeading(token);
    if (heading) {
      if (heading.type === "section") {
        if (!heading.starred) sectionNumber += 1;
        subsectionNumber = 0;
        blocks.push({
          type: "section",
          title: heading.title,
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

  return { blocks, hasDocument };
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
