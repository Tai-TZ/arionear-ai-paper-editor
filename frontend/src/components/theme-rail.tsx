import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";

/** Fixed theme switch on the right edge, vertically centered. */
export function ThemeRail() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="theme-rail fixed right-0 top-1/2 z-30 -translate-y-1/2">
      <button
        type="button"
        onClick={toggleTheme}
        className="theme-rail-btn flex h-12 w-11 flex-col items-center justify-center gap-1 border border-r-0 border-border/70 bg-card/95 text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-primary hover:text-primary-foreground"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Light mode" : "Dark mode"}
      >
        {isDark ? (
          <Sun className="h-4 w-4" strokeWidth={1.5} />
        ) : (
          <Moon className="h-4 w-4" strokeWidth={1.5} />
        )}
        <span className="font-sans-ui text-[9px] uppercase tracking-widest leading-none">
          {isDark ? "Light" : "Dark"}
        </span>
      </button>
    </div>
  );
}
