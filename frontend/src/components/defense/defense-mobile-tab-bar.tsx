import type { DefenseCopy } from "@/lib/defense-i18n";

export type DefenseMobileTab = "chat" | "pdf";

type Props = {
  tab: DefenseMobileTab;
  onChange: (tab: DefenseMobileTab) => void;
  copy: DefenseCopy["mobile"];
};

export function DefenseMobileTabBar({ tab, onChange, copy }: Props) {
  const tabs: { id: DefenseMobileTab; label: string }[] = [
    { id: "chat", label: copy.chat },
    { id: "pdf", label: copy.pdf },
  ];

  return (
    <nav className="defense-mobile-tabs flex md:hidden shrink-0 border-b border-border/40 bg-card">
      {tabs.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`defense-mobile-tab flex-1 py-3 text-sm font-medium transition ${
            tab === item.id
              ? "defense-mobile-tab--active border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
