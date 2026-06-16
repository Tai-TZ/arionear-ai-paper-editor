import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { termsContent } from "@/lib/marketing-content";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [{ title: "Terms — Arionear" }, { name: "description", content: termsContent.lede }],
  }),
  component: () => <MarketingPage content={termsContent} />,
});
