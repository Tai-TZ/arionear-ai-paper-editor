import {
  TemplatesLayoutContext,
  type TemplatesLayoutVariant,
} from "@/components/templates/template-gallery-layout";

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
