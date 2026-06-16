import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { latexGuideContent } from "@/lib/marketing-content";

export const Route = createFileRoute("/latex-guide")({
  head: () => ({
    meta: [
      { title: "LaTeX Guide — Arionear" },
      { name: "description", content: latexGuideContent.lede },
    ],
  }),
  component: () => <MarketingPage content={latexGuideContent} />,
});
