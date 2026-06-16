import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";

export function ThemeToggle({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle inline-flex items-center justify-center gap-2 border border-foreground/40 bg-background text-foreground transition-colors hover:bg-foreground hover:text-background ${compact ? "h-10 w-10" : "px-3 py-2 min-h-[40px]"} ${className}`}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      ) : (
        <Moon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      )}
      {!compact && (
        <span className="font-sans-ui text-[11px] uppercase tracking-widest">
          {isDark ? "Light" : "Dark"}
        </span>
      )}
    </button>
  );
}
