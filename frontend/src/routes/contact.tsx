import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { contactContent } from "@/lib/marketing-content";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [{ title: "Contact — Arionear" }, { name: "description", content: contactContent.lede }],
  }),
  component: () => <MarketingPage content={contactContent} />,
});
