import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { ethicsContent } from "@/lib/marketing-content";

export const Route = createFileRoute("/ethics")({
  head: () => ({
    meta: [{ title: "Ethics — Arionear" }, { name: "description", content: ethicsContent.lede }],
  }),
  component: () => <MarketingPage content={ethicsContent} />,
});
