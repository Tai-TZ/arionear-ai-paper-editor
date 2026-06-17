import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { privacyContent } from "@/lib/marketing-content";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy — Arionear" }, { name: "description", content: privacyContent.lede }],
  }),
  component: () => <MarketingPage content={privacyContent} />,
});
