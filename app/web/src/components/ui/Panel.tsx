import type { ReactNode } from "react";

export type BracketKind = "cy-tl" | "yl-tl" | "yl-br" | "rd-tr";

const BRACKETS: Record<BracketKind, string> = {
  "cy-tl": "-top-px -left-px border-t-2 border-l-2 border-cy",
  "yl-tl": "-top-px -left-px border-t-2 border-l-2 border-yl",
  "yl-br": "-bottom-px -right-px border-b-2 border-r-2 border-yl",
  "rd-tr": "-top-px -right-px border-t-2 border-r-2 border-rd",
};

/**
 * HUD panel: 1px edge border on panel background, optional corner brackets.
 * Pass one bracket or several, e.g. bracket={["yl-tl", "yl-br"]} (quiz card).
 */
export function Panel({ bracket, bracketSize = 14, className = "", children }: {
  bracket?: BracketKind | BracketKind[];
  bracketSize?: number;
  className?: string;
  children: ReactNode;
}) {
  const brackets = bracket ? (Array.isArray(bracket) ? bracket : [bracket]) : [];
  return (
    <div className={`relative border border-edge bg-panel ${className}`}>
      {brackets.map((b) => (
        <span key={b} aria-hidden
          className={`pointer-events-none absolute ${BRACKETS[b]}`}
          style={{ width: bracketSize, height: bracketSize }} />
      ))}
      {children}
    </div>
  );
}
