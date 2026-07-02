import { useLocale } from "@/components/locale-provider";
import { editorCopy } from "@/lib/editor-i18n";
import type { MobileTab } from "../types";

export function MobileTabBar({ tab, onChange }: { tab: MobileTab; onChange: (t: MobileTab) => void }) {
  const { locale } = useLocale();
  const t = editorCopy(locale);
  const tabs: { id: MobileTab; label: string }[] = [
    { id: "files", label: t.mobile.files },
    { id: "editor", label: t.mobile.editor },
    { id: "preview", label: t.mobile.preview },
  ];
  return (
    <nav className="flex md:hidden shrink-0 border-b border-border/40 bg-card">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 py-3 text-sm font-medium transition ${
            tab === t.id
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
