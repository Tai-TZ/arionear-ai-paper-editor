import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const Route = createFileRoute("/latex-guide")({
  head: () => ({
    meta: [{ title: "LaTeX Guide — Arionear" }],
  }),
  component: () => <MarketingPage slug="latex-guide" />,
});
