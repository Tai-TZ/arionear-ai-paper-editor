import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [{ title: "Contact — Edico" }],
  }),
  component: () => <MarketingPage slug="contact" />,
});
