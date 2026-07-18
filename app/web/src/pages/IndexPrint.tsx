import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ButtonPrimary, btnSecondary } from "../components/ui/Button";
import { bookColor } from "../lib/bookColor";
import { useCourse } from "../lib/course";
import { examIndexStore, sortedEntries } from "../stores/examIndex";
import { useStore } from "../stores/useStore";

export function IndexPrint() {
  const state = useStore(examIndexStore);
  const course = useCourse();
  const books = course?.books ?? [];
  const entries = useMemo(() => sortedEntries(state), [state]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to="/index" className={btnSecondary}>◂ BACK TO INDEX</Link>
        <ButtonPrimary onClick={() => window.print()}>PRINT ▸</ButtonPrimary>
      </div>

      <div className="print-sheet bg-white p-8 text-black">
        <h1 className="mb-1 text-2xl font-bold">
          {course?.name ?? "Course"} exam index
        </h1>
        <p className="mb-3 text-sm">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </p>
        <div className="mb-4 flex flex-wrap gap-3 text-xs">
          {books.map((b) => (
            <span key={b.slug} className="flex items-center gap-1">
              <span aria-hidden className="inline-block h-3 w-3"
                    style={{ backgroundColor: bookColor(books, b.slug) }} />
              {b.label}
            </span>
          ))}
        </div>
        <div className="columns-2 gap-8">
          {entries.map((e) => (
            <div key={e.id} className="mb-2 break-inside-avoid text-sm leading-snug">
              <span data-testid="print-term" className="font-bold">{e.term}</span>
              {e.definition && <span>: {e.definition}</span>}{" "}
              {e.citations.map((c, i) => (
                <span key={`${c.slug}:${c.page}`}
                      style={{ color: bookColor(books, c.slug) }}>
                  {i > 0 ? "; " : ""}{c.label} p.{c.page}
                </span>
              ))}
              {e.topic && <span className="text-[#666]"> [{e.topic}]</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
