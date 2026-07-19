import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ButtonPrimary, btnSecondary } from "../components/ui/Button";
import { bookColor } from "../lib/bookColor";
import { useCourse } from "../lib/course";
import { groupByLetter } from "../lib/indexGroups";
import { examIndexStore } from "../stores/examIndex";
import { printSettingsStore, updatePrintSettings } from "../stores/printSettings";
import { useStore } from "../stores/useStore";

const FONT_CLASS = { s: "text-[11px]", m: "text-[13px]", l: "text-[15px]" } as const;

export function IndexPrint() {
  const state = useStore(examIndexStore);
  const opts = useStore(printSettingsStore);
  const course = useCourse();
  const books = course?.books ?? [];
  const courseName = course?.name ?? "Course";
  const groups = useMemo(() => groupByLetter(state.entries), [state]);
  const total = state.entries.length;

  useEffect(() => {
    const prev = document.title;
    document.title = `${courseName} exam index`;
    return () => { document.title = prev; };
  }, [courseName]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/index" className={btnSecondary}>◂ BACK TO INDEX</Link>
        <label className="mono-label flex items-center gap-1 text-[10px]">
          <input type="checkbox" checked={opts.letterBreaks} aria-label="LETTER BREAKS"
                 onChange={(e) => updatePrintSettings({ letterBreaks: e.target.checked })} />
          LETTER BREAKS
        </label>
        <label className="mono-label flex items-center gap-1 text-[10px]">
          <input type="checkbox" checked={opts.coverSheet} aria-label="COVER SHEET"
                 onChange={(e) => updatePrintSettings({ coverSheet: e.target.checked })} />
          COVER SHEET
        </label>
        <label className="mono-label flex items-center gap-1 text-[10px]">
          FONT
          <select className="input-hud" value={opts.fontSize} aria-label="FONT"
                  onChange={(e) => updatePrintSettings({ fontSize: e.target.value as "s" | "m" | "l" })}>
            <option value="s">S</option><option value="m">M</option><option value="l">L</option>
          </select>
        </label>
        <label className="mono-label flex items-center gap-1 text-[10px]">
          COLUMNS
          <select className="input-hud" value={String(opts.columns)} aria-label="COLUMNS"
                  onChange={(e) => updatePrintSettings({ columns: Number(e.target.value) as 1 | 2 })}>
            <option value="1">1</option><option value="2">2</option>
          </select>
        </label>
        <ButtonPrimary onClick={() => window.print()}>PRINT ▸</ButtonPrimary>
      </div>
      <p className="mono-label mb-4 text-[10px] text-faint print:hidden">
        For page numbers, enable "Headers and footers" in the browser print dialog.
      </p>

      <div className="print-sheet bg-white p-8 text-black">
        {opts.coverSheet && (
          <div data-testid="print-cover" className="break-after-page">
            <h1 className="mb-2 text-3xl font-bold">{courseName} exam index</h1>
            <p className="mb-6 text-sm">{total} {total === 1 ? "entry" : "entries"}</p>
            <div className="flex flex-wrap gap-3 text-xs">
              {books.map((b) => (
                <span key={b.slug} className="flex items-center gap-1">
                  <span aria-hidden className="inline-block h-3 w-3"
                        style={{ backgroundColor: bookColor(books, b.slug) }} />
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        )}
        <div data-testid="print-entries"
             className={`${opts.columns === 2 ? "columns-2" : "columns-1"} gap-8 ${FONT_CLASS[opts.fontSize]}`}>
          {groups.map((g, gi) => (
            <section key={g.letter}
                     className={opts.letterBreaks && gi > 0 ? "break-before-page" : ""}>
              <h2 data-testid="letter-heading"
                  className="mb-1 mt-2 border-b border-black text-lg font-bold">{g.letter}</h2>
              {g.entries.map((e) => (
                <div key={e.id} className="mb-2 break-inside-avoid leading-snug">
                  <span data-testid="print-term" className="font-bold">{e.term}</span>
                  {e.definition && <span>: {e.definition}</span>}{" "}
                  {e.citations.map((c, i) => (
                    <span key={`${c.slug}:${c.page}`} style={{ color: bookColor(books, c.slug) }}>
                      {i > 0 ? "; " : ""}{c.label} p.{c.page}
                    </span>
                  ))}
                  {e.topic && <span className="text-[#666]"> [{e.topic}]</span>}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
