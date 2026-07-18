import type { ComponentProps } from "react";

/** Class strings exported for use on <Link>/<a> elements. */
export const btnPrimary =
  "chamfer inline-flex items-center gap-1.5 bg-yl px-4 py-2 text-sm font-bold " +
  "uppercase tracking-wider text-black transition-colors duration-120 " +
  "hover:bg-[#fff36b] disabled:opacity-50";

export const btnSecondary =
  "inline-flex items-center gap-1.5 border border-edge-2 bg-panel-2 px-4 py-2 " +
  "text-sm font-bold uppercase tracking-wider text-cy transition-colors " +
  "duration-120 hover:border-cy hover:bg-cy-dim disabled:opacity-50";

/** Solid yellow chamfered CTA. */
export function ButtonPrimary({ className = "", ...props }: ComponentProps<"button">) {
  return <button {...props} className={`${btnPrimary} ${className}`} />;
}

/** Bordered cyan secondary action. */
export function ButtonSecondary({ className = "", ...props }: ComponentProps<"button">) {
  return <button {...props} className={`${btnSecondary} ${className}`} />;
}
