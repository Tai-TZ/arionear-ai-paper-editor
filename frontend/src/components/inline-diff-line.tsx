import type { DiffPart } from "@/lib/text-diff";
import { HighlightedLatexLine } from "@/lib/latex-syntax";

export function InlineDiffLine({ parts }: { parts: DiffPart[] }) {
  return (
    <span className="latex-code-line latex-inline-diff-line">
      {parts.map((part, index) => {
        if (part.type === "delete") {
          return (
            <span key={index} className="diff-del">
              {part.text}
            </span>
          );
        }
        if (part.type === "insert") {
          return (
            <span key={index} className="diff-ins">
              {part.text}
            </span>
          );
        }
        return (
          <span key={index} className="diff-eq">
            <HighlightedLatexLine text={part.text} />
          </span>
        );
      })}
    </span>
  );
}
