import type React from "react";

export function IconBtn({
  children,
  sm,
  onClick,
}: {
  children: React.ReactNode;
  sm?: boolean;
  onClick?: () => void;
}) {
  const size = sm ? "h-7 w-7" : "h-8 w-8";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex ${size} items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground`}
    >
      {children}
    </button>
  );
}
