import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type ProoflineWordmarkProps = ComponentPropsWithoutRef<"span">;

export function ProoflineWordmark({ className, ...props }: ProoflineWordmarkProps) {
  return (
    <span className={cn(className)} {...props}>
      <span className="text-inherit">Proof</span>
      <span className="text-[color:var(--editorial-red)]">line</span>
    </span>
  );
}
