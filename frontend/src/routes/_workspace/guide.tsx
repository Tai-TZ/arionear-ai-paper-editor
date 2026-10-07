import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { UserGuideContent } from "@/components/workspace/user-guide-content";
import { useLocale } from "@/components/locale-context";
import { guideCopy } from "@/lib/guide-i18n";

export const Route = createFileRoute("/_workspace/guide")({
  head: () => {
    const en = guideCopy("en");
    return {
      meta: [{ title: `${en.title} — Proofline` }, { name: "description", content: en.lede }],
    };
  },
  component: WorkspaceGuidePage,
});

function WorkspaceGuidePage() {
  const { locale } = useLocale();
  const g = useMemo(() => guideCopy(locale), [locale]);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="workspace-main-header flex shrink-0 items-center border-b border-foreground bg-background px-4 md:px-8">
        <h1 className="truncate font-serif-display text-lg font-bold tracking-tight md:text-xl">
          {g.title}
        </h1>
      </header>
      <UserGuideContent />
    </main>
  );
}
