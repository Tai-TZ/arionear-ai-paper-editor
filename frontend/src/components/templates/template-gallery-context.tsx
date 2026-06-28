import { createContext, useContext } from "react";

export type TemplatesLayoutVariant = "marketing" | "workspace";

const TemplatesLayoutContext = createContext<TemplatesLayoutVariant>("marketing");

export function TemplatesLayoutProvider({
  variant,
  children,
}: {
  variant: TemplatesLayoutVariant;
  children: React.ReactNode;
}) {
  return (
    <TemplatesLayoutContext.Provider value={variant}>{children}</TemplatesLayoutContext.Provider>
  );
}

export function useTemplatesLayoutVariant(): TemplatesLayoutVariant {
  return useContext(TemplatesLayoutContext);
}
