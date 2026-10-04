import { createContext, useContext } from "react";

export type TemplatesLayoutVariant = "marketing" | "workspace";

export const TemplatesLayoutContext = createContext<TemplatesLayoutVariant>("marketing");

export function useTemplatesLayoutVariant(): TemplatesLayoutVariant {
  return useContext(TemplatesLayoutContext);
}
