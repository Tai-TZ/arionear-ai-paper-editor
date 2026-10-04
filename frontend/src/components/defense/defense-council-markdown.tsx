import type { ComponentPropsWithoutRef } from "react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseDefensePdfLink, type DefensePdfCitation } from "@/lib/defense-pdf-links";
import { prepareDefenseCouncilMarkdown } from "@/lib/defense-pdf-autolink";
import { useMarkdownMath } from "@/lib/markdown-math";

const REMARK_PLUGINS = [remarkGfm];

type Props = {
  content: string;
  latexContent?: string;
  isStreaming?: boolean;
  onPdfCitation?: (citation: DefensePdfCitation) => void;
};

function DefenseMarkdownLink({
  href,
  children,
  onPdfCitation,
  ...rest
}: ComponentPropsWithoutRef<"a"> & { onPdfCitation?: (citation: DefensePdfCitation) => void }) {
  const citation = href ? parseDefensePdfLink(href) : null;

  if (citation) {
    return (
      <button
        type="button"
        className="defense-pdf-cite"
        onClick={() => onPdfCitation?.(citation)}
        title={`Highlight "${citation.search}" in PDF`}
      >
        {children}
      </button>
    );
  }

  // Malformed #pdf? link (failed validation) — render as plain text
  if (href?.startsWith("#pdf?")) {
    return <>{children}</>;
  }

  return (
    <a href={href} {...rest} target="_blank" rel="noreferrer noopener" className="defense-pdf-cite">
      {children}
    </a>
  );
}

export function DefenseCouncilMarkdown({
  content,
  latexContent = "",
  isStreaming,
  onPdfCitation,
}: Props) {
  const markdown = useMemo(() => {
    if (isStreaming || !latexContent.trim()) return content;
    return prepareDefenseCouncilMarkdown(content, latexContent);
  }, [content, latexContent, isStreaming]);
  // Math (`$…$`, KaTeX) only once the turn has finished streaming — see useMarkdownMath.
  const math = useMarkdownMath(markdown, !isStreaming);

  return (
    <div className="defense-msg-council-body defense-msg-council-markdown">
      <ReactMarkdown
        remarkPlugins={math?.remarkPlugins ?? REMARK_PLUGINS}
        rehypePlugins={math?.rehypePlugins}
        components={{
          a: (props) => <DefenseMarkdownLink {...props} onPdfCitation={onPdfCitation} />,
          p: ({ children }) => <p className="defense-md-p">{children}</p>,
        }}
      >
        {markdown}
      </ReactMarkdown>
      {isStreaming && <span className="chat-stream-cursor" aria-hidden />}
    </div>
  );
}
