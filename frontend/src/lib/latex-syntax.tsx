export type LatexToken = {
  type: "comment" | "cmd" | "opt" | "brace" | "key" | "text";
  text: string;
};

function pushTextTokens(tokens: LatexToken[], text: string) {
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

export function parseLatexTokens(text: string): LatexToken[] {
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
      tokens.push(...parseLatexTokens(text.slice(i + 1, j - 1)));
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
    pushTextTokens(tokens, text.slice(i, j));
    i = j;
  }

  return tokens.filter((token) => token.text.length > 0);
}

export function HighlightedLatexLine({ text }: { text: string }) {
  const tokens = parseLatexTokens(text);

  if (tokens.length === 0) {
    return <span className="latex-tok-text">&nbsp;</span>;
  }

  return (
    <span className="latex-code-line">
      {tokens.map((token, index) => (
        <span key={index} className={`latex-tok-${token.type}`}>
          {token.text}
        </span>
      ))}
    </span>
  );
}
