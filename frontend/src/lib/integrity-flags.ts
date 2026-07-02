import type { IntegrityFlag } from "@/lib/api/academic";

export function hasBlockingIntegrityFlags(
  flags: Pick<IntegrityFlag, "severity">[] | undefined,
): boolean {
  return Boolean(flags?.some((f) => f.severity === "error"));
}
