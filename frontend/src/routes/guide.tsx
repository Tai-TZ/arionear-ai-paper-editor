import { createFileRoute } from "@tanstack/react-router";
import { UserGuidePage } from "@/components/marketing/user-guide-page";
import { guideCopy } from "@/lib/guide-i18n";

export const Route = createFileRoute("/guide")({
  head: () => {
    const en = guideCopy("en");
    return {
      meta: [
        { title: `${en.title} — Arionear` },
        { name: "description", content: en.lede },
      ],
    };
  },
  component: UserGuidePage,
});
