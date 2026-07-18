import { useLightbox } from "./Lightbox";

/** Compact HUD form of a citation ("Book 2 p.76" reads "BK2 P.76"). */
function compact(text: string): string {
  return text
    .replace(/\bBook\s+([1-5B])\b/gi, "BK$1")
    .replace(/\bWorkbook\b/gi, "WKBK");
}

export function CitationChip({ label, slug, page, text }:
  { label: string; slug: string; page: number; text: string }) {
  const { open } = useLightbox();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); open({ slug, label, page }); }}
      title={`Open ${label} p.${page}`}
      aria-label={text}
      className="mx-0.5 inline-block border border-edge-2 px-1.5 py-px
                 align-baseline font-mono text-[10px] uppercase text-cy
                 transition-colors duration-120 hover:border-cy hover:bg-cy-dim"
    >
      {compact(text)}
    </button>
  );
}
