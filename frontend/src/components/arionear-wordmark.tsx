import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type ArionearWordmarkProps = ComponentPropsWithoutRef<"span">;

export function ArionearWordmark({ className, ...props }: ArionearWordmarkProps) {
  return (
    <span className={cn(className)} {...props}>
      <span className="text-inherit">Ario</span>
      <span className="text-[color:var(--editorial-red)]">near</span>
    </span>
  );
}
