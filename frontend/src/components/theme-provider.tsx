import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ThemeContext, type ThemeContextValue } from "@/components/theme-context";
import { applyTheme, getStoredTheme, toggleTheme, type Theme } from "@/lib/theme-store";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === "undefined" ? "light" : getStoredTheme(),
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (next) => setThemeState(next),
      toggleTheme: () => setThemeState((current) => toggleTheme(current)),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
