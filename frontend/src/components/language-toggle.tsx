import { useLocale } from "@/components/locale-context";
import type { UiLanguage } from "@/lib/locale-store";

const OPTIONS: { id: UiLanguage; label: string }[] = [
  { id: "en", label: "ENG" },
  { id: "vi", label: "VIE" },
];

export function LanguageToggle({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { locale, setLocale } = useLocale();

  return (
    <div
      className={`language-toggle inline-flex items-stretch border border-foreground/40 bg-background text-foreground ${compact ? "language-toggle-compact" : ""} ${className}`}
      role="group"
      aria-label="Interface language"
    >
      {OPTIONS.map(({ id, label }) => {
        const active = locale === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(id)}
            className={`language-toggle-option font-sans-ui uppercase tracking-widest transition-colors ${
              active ? "bg-foreground text-background" : "hover:bg-foreground/10"
            } ${compact ? "px-2 py-2 text-[10px] min-h-[40px]" : "px-3 py-2 text-[11px] min-h-[40px]"}`}
            title={id === "en" ? "English" : "Tiếng Việt"}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
