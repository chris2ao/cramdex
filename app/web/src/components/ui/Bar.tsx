export type BarColor = "cy" | "gn" | "rd" | "yl";

const FILLS: Record<BarColor, string> = {
  cy: "bg-cy",
  gn: "bg-gn",
  rd: "bg-rd",
  yl: "bg-yl",
};

/** Flat neon progress bar. Track is panel-2 with a 1px edge border. */
export function Bar({ value, color = "cy", dashed = false, height = 8, className = "" }: {
  value: number;
  color?: BarColor;
  dashed?: boolean;
  height?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`border border-edge bg-panel-2 ${className}`}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full ${dashed ? "bar-dashed" : FILLS[color]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
