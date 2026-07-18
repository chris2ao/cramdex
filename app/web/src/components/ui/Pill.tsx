import type { ComponentProps } from "react";

const ACTIVE = {
  cy: "border-cy bg-cy text-black",
  yl: "border-yl bg-yl text-black",
} as const;

/** Filter pill: mono uppercase box. Active renders solid neon with black text. */
export function Pill({ active = false, color = "cy", className = "", ...props }: {
  active?: boolean;
  color?: keyof typeof ACTIVE;
} & ComponentProps<"button">) {
  const state = active
    ? ACTIVE[color]
    : "border-edge-2 bg-panel text-muted hover:border-cy hover:text-fg";
  return (
    <button
      {...props}
      className={`border px-3 py-1.5 font-mono text-[11px] uppercase
                  tracking-[0.06em] transition-colors duration-120
                  disabled:opacity-50 ${state} ${className}`}
    />
  );
}
