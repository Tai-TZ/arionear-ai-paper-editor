import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { ChatMessages, type ChatMessage } from "@/components/chat-overlay";
import { DefenseCouncilMarkdown } from "@/components/defense/defense-council-markdown";
import { LocaleContext } from "@/components/locale-context";
import { loadMarkdownMath, mayContainMath } from "@/lib/markdown-math";
import { isTexMathSpan } from "@/lib/markdown-math-plugins";

// Components pick the plugins up synchronously once loaded (a browser loads them on the first `$`).
beforeAll(async () => {
  await loadMarkdownMath();
});

function renderChat(messages: ChatMessage[]): string {
  return renderToStaticMarkup(
    createElement(
      LocaleContext.Provider,
      { value: { locale: "en", setLocale: () => {}, ready: true } },
      createElement(ChatMessages, { messages, chatEndRef: { current: null } }),
    ),
  );
}

function renderReply(content: string, isStreaming = false): string {
  return renderChat([
    { id: "u1", role: "user", content: "question" },
    { id: "a1", role: "assistant", content, isStreaming },
  ]);
}

describe("math in Dico chat replies", () => {
  it("typesets inline and display math in a finished reply", () => {
    const html = renderReply(
      String.raw`The energy is $E = mc^2$ where $c$ is the speed of light.

$$\int_0^1 x\,dx = \tfrac{1}{2}$$`,
    );

    expect(html.match(/class="katex"/g)).toHaveLength(3);
    expect(html.match(/class="katex-display"/g)).toHaveLength(1);
    expect(html).not.toContain("$E = mc^2$");
  });

  it("uses display mode for $$ fences and lone $$…$$ paragraphs, inline mode for $$ in text", () => {
    const fenced = renderReply("Solve:\n\n$$\nx^2 = 4\n$$");
    const inText = renderReply("so $$x^2$$ holds");

    expect(fenced.match(/class="katex-display"/g)).toHaveLength(1);
    expect(inText).toContain('class="katex"');
    expect(inText).not.toContain("katex-display");
  });

  it("leaves prices as plain text", () => {
    for (const text of ["$5 and $10", "It costs $5 and $10 per month.", "Budget: $5-$10."]) {
      const html = renderReply(text);
      expect(html).not.toContain("katex");
      expect(html).toContain(text);
    }
  });

  it("keeps a price next to real math as text", () => {
    const html = renderReply("Let $x$ be the cost: $5 and $10 are the options.");

    expect(html.match(/class="katex"/g)).toHaveLength(1);
    expect(html).toContain(": $5 and $10 are the options.");
  });

  it("does not typeset while the reply is still streaming", () => {
    const html = renderReply("The energy is $E = mc^2$", true);

    expect(html).not.toContain("katex");
    expect(html).toContain("$E = mc^2$");
  });

  it("shows KaTeX's error text instead of throwing on invalid TeX", () => {
    const html = renderReply(String.raw`Broken: $\frac{1$ and fine: $y$`);

    expect(html).toContain("katex-error");
  });

  it("does not touch code spans and blocks", () => {
    const html = renderReply("Use `$x^2$` or:\n\n```latex\n$\\alpha$\n```");

    expect(html).not.toContain("katex");
    expect(html).toContain("<code>$x^2$</code>");
  });
});

describe("math in defense council replies", () => {
  it("typesets math once the turn is complete, not while streaming", () => {
    const content = String.raw`Why is $\lambda = 0.5$ optimal?`;
    const done = renderToStaticMarkup(createElement(DefenseCouncilMarkdown, { content }));
    const streaming = renderToStaticMarkup(
      createElement(DefenseCouncilMarkdown, { content, isStreaming: true }),
    );

    expect(done).toContain('class="katex"');
    expect(streaming).not.toContain("katex");
  });
});

describe("isTexMathSpan", () => {
  // A loop rather than it.each: vitest would read "$5" in a test title as a parameter reference.
  it("applies the Pandoc dollar rule to single-dollar spans", () => {
    const cases: [raw: string, next: string, expected: boolean][] = [
      ["$x$", " ", true],
      [String.raw`$\alpha + \beta$`, ".", true],
      ["$O(n)$", ",", true],
      ["$$5 and $$", "1", true],
      ["$5 and $", "1", false],
      ["$5-$", "1", false],
      ["$ x$", " ", false],
      ["$x $", " ", false],
      ["$x$", "2", false],
    ];
    for (const [raw, next, expected] of cases) {
      expect(isTexMathSpan(raw, next), `${raw} followed by ${JSON.stringify(next)}`).toBe(expected);
    }
  });
});

describe("mayContainMath", () => {
  it("spots dollar delimiters and math fences only", () => {
    expect(mayContainMath("a $x$ b")).toBe(true);
    expect(mayContainMath("```math\nx^2\n```")).toBe(true);
    expect(mayContainMath("plain **markdown** with `code`")).toBe(false);
  });
});
