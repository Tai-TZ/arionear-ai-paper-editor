import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type EdicoWordmarkProps = ComponentPropsWithoutRef<"span">;

export function EdicoWordmark({ className, ...props }: EdicoWordmarkProps) {
  return (
    <span className={cn(className)} {...props}>
      <span className="text-inherit">E</span>
      <span className="text-[color:var(--editorial-accent)]">dico</span>
    </span>
  );
}
