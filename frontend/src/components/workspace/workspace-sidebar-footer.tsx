import { LogOut, Moon, Sun } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { useTheme } from "@/components/theme-provider";
import type { UiLanguage } from "@/lib/locale-store";

const LANG_OPTIONS: { id: UiLanguage; label: string }[] = [
  { id: "en", label: "ENG" },
  { id: "vi", label: "VIE" },
];

type WorkspaceSidebarFooterProps = {
  signOutLabel: string;
  onSignOut: () => void;
};

export function WorkspaceSidebarFooter({ signOutLabel, onSignOut }: WorkspaceSidebarFooterProps) {
  const { locale, setLocale } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="workspace-sidebar-footer">
      <div className="workspace-pref-dock" role="group" aria-label="Preferences">
        <div className="workspace-lang-segment" role="group" aria-label="Interface language">
          {LANG_OPTIONS.map(({ id, label }) => {
            const active = locale === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setLocale(id)}
                className={`workspace-lang-btn${active ? " is-active" : ""}`}
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
          className="workspace-theme-btn"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark ? (
            <Sun className="h-3.5 w-3.5" strokeWidth={1.5} />
          ) : (
            <Moon className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
        </button>
      </div>

      <button type="button" onClick={onSignOut} className="workspace-signout-row">
        <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        <span>{signOutLabel}</span>
      </button>
    </div>
  );
}
