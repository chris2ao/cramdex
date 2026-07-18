import { useState } from "react";
import { useFetch } from "../hooks/useFetch";
import { useLightbox } from "../components/Lightbox";
import { Panel } from "../components/ui/Panel";
import { Eyebrow } from "../components/ui/Text";
import { useCourse } from "../lib/course";

type Row = { title: string; book: string; page: number };

const COLS = "grid grid-cols-[1fr_100px_80px] gap-3 px-[18px]";

export function SlideIndex() {
  const course = useCourse();
  const { data, error } = useFetch<{ items: Row[] }>("/api/content/slide-index");
  const { open } = useLightbox();
  const [filter, setFilter] = useState("");
  const [book, setBook] = useState("");

  const rows = (data?.items ?? []).filter((r) =>
    r.title.toLowerCase().includes(filter.toLowerCase()) &&
    (!book || r.book === book));
  const books = [...new Set(data?.items.map((r) => r.book) ?? [])];

  if (error) return <p className="text-rd">{error}</p>;
  if (!course) return null;
  const slugByLabel = new Map(course.books.map((b) => [b.label, b.slug]));
  return (
    <div>
      <Eyebrow className="mb-2">SLIDE_REGISTRY</Eyebrow>
      <h1 className="text-[30px] font-bold uppercase tracking-wide text-fg">Slide index</h1>
      <p className="mb-4 mt-1.5 font-mono text-[11px] tracking-[0.05em] text-faint">
        {data === null ? "…" : rows.length} SLIDE TITLES · SELECT ROW TO OPEN PAGE
      </p>

      <div className="mb-3.5 flex gap-2.5">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter slide titles //"
          aria-label="Filter slide titles"
          className="input-hud max-w-[420px] flex-1 px-4 py-2.5 text-base font-medium"
        />
        <select
          value={book}
          onChange={(e) => setBook(e.target.value)}
          aria-label="Filter by book"
          className="border border-edge-2 bg-panel px-3 font-mono text-sm uppercase text-fg"
        >
          <option value="">All books</option>
          {books.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <Panel>
        <div className={`${COLS} border-b border-edge-2 bg-panel-2 py-2.5`}>
          <span className="font-mono text-[9px] tracking-[0.18em] text-faint">SLIDE_TITLE</span>
          <span className="font-mono text-[9px] tracking-[0.18em] text-faint">BOOK</span>
          <span className="text-right font-mono text-[9px] tracking-[0.18em] text-faint">PAGE</span>
        </div>
        {rows.map((r) => {
          const slug = slugByLabel.get(r.book);
          return (
            <button
              key={`${r.book}:${r.page}:${r.title}`}
              onClick={() => slug && open({ slug, label: r.book, page: r.page })}
              aria-label={r.title}
              className={`${COLS} w-full items-baseline border-b border-edge py-2.5 text-left
                          transition-colors duration-120 last:border-b-0 hover:bg-panel-2`}
            >
              <span className="text-[15px] font-medium text-fg">{r.title}</span>
              <span className="font-mono text-[11px] text-faint">{r.book}</span>
              <span className="text-right font-mono text-[11px] text-cy">p.{r.page}</span>
            </button>
          );
        })}
      </Panel>
    </div>
  );
}
