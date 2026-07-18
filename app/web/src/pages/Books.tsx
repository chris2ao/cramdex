import { Link } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { useStore } from "../stores/useStore";
import { readingStore, bookPct } from "../stores/reading";
import { Eyebrow, MonoLabel } from "../components/ui/Text";
import { Bar } from "../components/ui/Bar";

type BookItem = { slug: string; label: string; pages: number };
type BooksResponse = { items: BookItem[] };

/** Short mono code for a book slug: book1 -> BK_1, bookB -> BK_B, workbook -> WKBK. */
function bookCode(slug: string): string {
  if (slug === "workbook") return "WKBK";
  return `BK_${slug.replace(/^book/i, "").toUpperCase()}`;
}

/** Library of the seven course books with real per-book reading progress. */
export function Books() {
  const { data, error } = useFetch<BooksResponse>("/api/content/books");
  const reading = useStore(readingStore);

  return (
    <div>
      <Eyebrow className="mb-2">CODEX</Eyebrow>
      <h1 className="mb-1.5 text-[30px] font-bold uppercase tracking-[0.02em]">CODEX</h1>
      <MonoLabel className="mb-5 block text-[10px] tracking-[0.05em] text-faint">
        SEVEN VOLUMES · 923 PAGES · SELECT TO OPEN
      </MonoLabel>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {error ? (
          <LibraryError />
        ) : data ? (
          data.items.map((book) => (
            <BookTile
              key={book.slug}
              book={book}
              pct={bookPct(reading, book.slug, book.pages)}
              lastPage={reading.books[book.slug]?.lastPage ?? 0}
            />
          ))
        ) : (
          Array.from({ length: 7 }, (_, i) => <SkeletonTile key={i} />)
        )}
      </div>
    </div>
  );
}

function BookTile({ book, pct, lastPage }: { book: BookItem; pct: number; lastPage: number }) {
  // A book counts as started only once actively read (lastPage > 0); a peeked-only
  // book (maxPage bumped via the search lightbox, lastPage still 0) reads NOT STARTED.
  const started = lastPage > 0;
  return (
    <Link
      to={`/books/${book.slug}`}
      className="group relative flex items-center gap-4 border border-edge bg-panel p-3.5
                 transition-colors duration-120 hover:border-cy"
    >
      <div
        className="chamfer-lg flex h-16 w-[50px] shrink-0 items-end justify-center pb-1.5
                   bg-[linear-gradient(160deg,#00e5ff_0%,#0077aa_100%)]"
      >
        <span className="font-mono text-[10px] text-[#031018]">{bookCode(book.slug)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[17px] font-bold uppercase tracking-[0.03em] text-fg">{book.label}</div>
        <div className="mt-1 font-mono text-[10px] tracking-[0.12em] text-faint">
          {book.pages} PAGES · {started ? `P.${lastPage}/${book.pages}` : "NOT STARTED"}
        </div>
        <Bar value={pct} color={pct === 100 ? "gn" : "cy"} height={5} className="mt-2.5" />
      </div>
      <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-cy">
        {started ? "RESUME ▸" : "OPEN ▸"}
      </span>
    </Link>
  );
}

function SkeletonTile() {
  return (
    <div className="flex items-center gap-4 border border-edge bg-panel p-3.5">
      <div className="chamfer-lg h-16 w-[50px] shrink-0 bg-panel-2" />
      <div className="min-w-0 flex-1">
        <div className="h-4 w-2/3 bg-panel-2" />
        <div className="mt-2 h-2.5 w-1/3 bg-panel-2" />
        <div className="mt-2.5 h-[5px] w-full bg-panel-2" />
      </div>
    </div>
  );
}

function LibraryError() {
  return (
    <div className="border border-rd bg-rd-dim p-6 md:col-span-2">
      <div className="mono-label text-[10px] text-rd">{"// LIBRARY_UNAVAILABLE"}</div>
      <p className="mt-2 text-muted">
        Corpus index not found. Run scripts/build.sh (see corpus status in the top bar).
      </p>
    </div>
  );
}
