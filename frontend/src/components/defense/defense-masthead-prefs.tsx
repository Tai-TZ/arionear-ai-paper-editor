import { Moon, Sun } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";

const LANG_OPTIONS = [
  { id: "en" as const, label: "ENG" },
  { id: "vi" as const, label: "VIE" },
];

export function DefenseMastheadPrefs() {
  const { locale, setLocale } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="defense-masthead-prefs" role="group" aria-label="Preferences">
      <div className="defense-masthead-lang" role="group" aria-label="Interface language">
        {LANG_OPTIONS.map(({ id, label }) => {
          const active = locale === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setLocale(id)}
              className={`defense-masthead-lang-btn${active ? " is-active" : ""}`}
              title={id === "en" ? "English" : "Tiếng Việt"}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        className="defense-masthead-theme-btn"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Light mode" : "Dark mode"}
      >
        {isDark ? <Sun className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Moon className="h-3.5 w-3.5" strokeWidth={1.5} />}
      </button>
    </div>
  );
}
