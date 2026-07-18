import type { ReactNode } from "react";

const EYEBROW_COLORS = {
  rd: "text-rd",
  cy: "text-cy",
  yl: "text-yl",
  faint: "text-faint",
} as const;

/** Section eyebrow: mono, uppercase, prefixed with a double slash. */
export function Eyebrow({ children, color = "rd", className = "" }: {
  children: ReactNode;
  color?: keyof typeof EYEBROW_COLORS;
  className?: string;
}) {
  return (
    <div className={`mono-label text-[10px] tracking-[0.25em]
                     ${EYEBROW_COLORS[color]} ${className}`}>
      {"// "}{children}
    </div>
  );
}

/** Generic mono system label (faint by default). */
export function MonoLabel({ children, className = "" }: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`mono-label text-[10px] text-faint ${className}`}>
      {children}
    </span>
  );
}
