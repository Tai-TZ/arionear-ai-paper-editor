import { describe, expect, it } from "vitest";

import { tokenizeLatex, tokenizeLatexLine, type LatexToken } from "./latex-tokenize";

// ── Reference: the previous (quadratic) tokenizer from latex-syntax.tsx, copied verbatim ─────────

function referencePushTextTokens(tokens: LatexToken[], text: string) {
  let i = 0;
  while (i < text.length) {
    const keyMatch = text.slice(i).match(/^[a-zA-Z@][a-zA-Z0-9]*/);
    if (keyMatch && text[i + keyMatch[0].length] === "=") {
      tokens.push({ type: "key", text: keyMatch[0] });
      i += keyMatch[0].length;
      continue;
    }

    let j = i + 1;
    while (j < text.length) {
      const rest = text.slice(j);
      if (rest.startsWith("\\") || rest.startsWith("{") || rest.startsWith("[")) break;
      const nextKey = rest.match(/^[a-zA-Z@][a-zA-Z0-9]*(?==)/);
      if (nextKey) break;
      j += 1;
    }

    tokens.push({ type: "text", text: text.slice(i, j) });
    i = j;
  }
}

function referenceParseLatexTokens(text: string): LatexToken[] {
  const tokens: LatexToken[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === "%") {
      tokens.push({ type: "comment", text: text.slice(i) });
      break;
    }

    if (text[i] === "\\") {
      const match = text.slice(i).match(/^\\[a-zA-Z@]+/);
      if (match) {
        tokens.push({ type: "cmd", text: match[0] });
        i += match[0].length;
        continue;
      }
    }

    if (text[i] === "[") {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "[") depth += 1;
        if (text[j] === "]") depth -= 1;
        j += 1;
      }
      tokens.push({ type: "opt", text: text.slice(i, j) });
      i = j;
      continue;
    }

    if (text[i] === "{") {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth += 1;
        if (text[j] === "}") depth -= 1;
        j += 1;
      }
      tokens.push({ type: "brace", text: "{" });
      tokens.push(...referenceParseLatexTokens(text.slice(i + 1, j - 1)));
      tokens.push({ type: "brace", text: "}" });
      i = j;
      continue;
    }

    let j = i + 1;
    while (
      j < text.length &&
      text[j] !== "%" &&
      text[j] !== "\\" &&
      text[j] !== "{" &&
      text[j] !== "["
    ) {
      j += 1;
    }
    referencePushTextTokens(tokens, text.slice(i, j));
    i = j;
  }

  return tokens.filter((token) => token.text.length > 0);
}

// ── Corpus ───────────────────────────────────────────────────────────────────────────────────────

const CORPUS = [
  "",
  " ",
  "\t",
  "plain text only",
  "\\documentclass[11pt,a4paper]{article}",
  "\\usepackage[utf8]{inputenc}",
  "\\usepackage[margin=1in, top=2cm]{geometry}",
  "\\usepackage{amsmath,amssymb,amsthm}",
  "\\hypersetup{colorlinks=true, linkcolor=blue, citecolor=green!50!black}",
  "\\title{A Study of \\emph{Things} and {Nested {Braces}}}",
  "\\author{Jane Doe\\thanks{Corresponding author: jane@example.com}}",
  "\\begin{document}",
  "\\maketitle",
  "\\section{Introduction}\\label{sec:intro}",
  "As shown in \\cite{smith2020, doe2021}, the result holds. % TODO: rephrase",
  "% a full-line comment with \\commands and {braces}",
  "100\\% of cases \\% escaped percent",
  "Inline math $a^2 + b^2 = c^2$ and display \\[ E = mc^2 \\]",
  "\\begin{figure}[htbp]",
  "  \\centering",
  "  \\includegraphics[width=0.8\\linewidth]{figures/plot.pdf}",
  "  \\caption{Results for $\\alpha=0.5$.}",
  "\\end{figure}",
  "\\newcommand{\\R}{\\mathbb{R}}",
  "\\def\\foo#1{\\textbf{#1}}",
  "\\makeatletter \\@ifundefined{foo}{}{} \\makeatother",
  "key=value, other_key = 3, x1y2=z, @at=1, a@b=2, 9abc=4",
  "\\setlength{\\parindent}{0pt} \\setcounter{secnumdepth}{3}",
  "\\title{Unclosed brace on this line",
  "{",
  "}",
  "{}",
  "[",
  "]",
  "[]",
  "[[nested] opts]",
  "\\[",
  "\\]",
  "\\\\",
  "\\",
  "text \\",
  "{a % b} c",
  "[a % b] c",
  "\\cmd{arg}[opt]{\\inner{deep{deeper}}}",
  "abc=",
  "=abc",
  "==",
  "a==b",
  "ab-cd=1",
  "a1b1c1=2",
  "x = y",
  "\\item[(a)] First item with width=3cm inside text",
  "\\begin{tabular}{|l|c|r|} \\hline",
  "Cell 1 & Cell 2 & Cell 3 \\\\ \\hline",
  "Tiếng Việt có dấu \\textit{nghiên cứu} khoa học = tốt",
  "emoji 🎉 \\cmd{🎉}=x",
  "\\verb|a{b|",
  "}}}{{{",
  "]]][[[",
  "%",
  "%%%",
  "\\%",
  "\\@",
  "\\@@foo@bar baz",
];

// Deterministic pseudo-random generator so failures are reproducible.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FUZZ_ALPHABET = [
  "\\",
  "{",
  "}",
  "[",
  "]",
  "%",
  "=",
  "@",
  " ",
  "a",
  "b",
  "Z",
  "1",
  "9",
  ",",
  "$",
  "-",
  "_",
  "é",
  "\\section",
  "key=",
];

function fuzzLines(count: number, seed: number): string[] {
  const random = mulberry32(seed);
  const lines: string[] = [];
  for (let n = 0; n < count; n += 1) {
    const length = Math.floor(random() * 40);
    let line = "";
    for (let k = 0; k < length; k += 1) {
      line += FUZZ_ALPHABET[Math.floor(random() * FUZZ_ALPHABET.length)];
    }
    lines.push(line);
  }
  return lines;
}

describe("tokenizeLatex", () => {
  it("matches the previous tokenizer on a LaTeX corpus", () => {
    for (const line of CORPUS) {
      expect(tokenizeLatex(line), JSON.stringify(line)).toEqual(referenceParseLatexTokens(line));
    }
  });

  it("matches the previous tokenizer on randomized lines", () => {
    for (const line of fuzzLines(5000, 20261004)) {
      expect(tokenizeLatex(line), JSON.stringify(line)).toEqual(referenceParseLatexTokens(line));
    }
  });

  it("concatenated token text reproduces balanced lines", () => {
    const line = "\\usepackage[margin=1in]{geometry} % layout";
    expect(
      tokenizeLatex(line)
        .map((token) => token.text)
        .join(""),
    ).toBe(line);
  });

  it("stays fast on very long lines", () => {
    const line = `${"word key=value ".repeat(4000)}${"\\cmd{x}".repeat(4000)}`;
    const started = performance.now();
    const tokens = tokenizeLatex(line);
    const elapsed = performance.now() - started;
    expect(tokens.length).toBeGreaterThan(0);
    // The previous implementation sliced the rest of the line per character (quadratic); a linear
    // scan of ~90k characters finishes in a few milliseconds even on slow CI machines.
    expect(elapsed).toBeLessThan(500);
  });
});

describe("tokenizeLatexLine", () => {
  it("returns cached tokens for repeated lines", () => {
    const line = "\\section{Cached line}";
    const first = tokenizeLatexLine(line);
    expect(tokenizeLatexLine(line)).toBe(first);
    expect(first).toEqual(referenceParseLatexTokens(line));
  });
});
