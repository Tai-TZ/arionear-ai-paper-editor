import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/components/marketing/about-page";
import { aboutContent } from "@/lib/marketing-content";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [{ title: "About — Arionear" }, { name: "description", content: aboutContent.lede }],
  }),
  component: AboutPage,
});
