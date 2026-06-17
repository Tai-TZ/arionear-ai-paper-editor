import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { integrityContent } from "@/lib/marketing-content";

export const Route = createFileRoute("/integrity")({
  head: () => ({
    meta: [
      { title: "Integrity — Arionear" },
      { name: "description", content: integrityContent.lede },
    ],
  }),
  component: () => <MarketingPage content={integrityContent} />,
});
