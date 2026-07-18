import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { useStore } from "../stores/useStore";
import { readingStore, recordPageView, bookPct } from "../stores/reading";
import { bookmarksStore, addBookmark, removeBookmark, isBookmarked } from "../stores/bookmarks";
import { pushRecent } from "../stores/recent";
import { useLightbox } from "../components/Lightbox";
import { AddToIndexButton } from "../components/IndexCapture";
import { ButtonSecondary } from "../components/ui/Button";

type BookItem = { slug: string; label: string; pages: number };
type BooksResponse = { items: BookItem[] };

/** Clamps an arbitrary number to a valid 1..pages printed page. */
function clampPage(p: number, pages: number): number {
  if (!Number.isFinite(p)) return 1;
  return Math.max(1, Math.min(pages, Math.round(p)));
}

/** In-app page reader for one course book; tracks reading progress on every page. */
export function BookReader() {
  const { slug = "" } = useParams();
  const { data, error } = useFetch<BooksResponse>("/api/content/books");

  if (error) return <CorpusOffline />;
  if (!data) return <ReaderLoading />;
  const book = data.items.find((b) => b.slug === slug);
  if (!book) return <UnknownVolume />;
  // Key by slug so switching books remounts: fresh page init + a clean unmount record.
  return <Reader key={book.slug} book={book} />;
}

function readInitialPage(param: string | null, lastPage: number, pages: number): number {
  if (param != null && param.trim() !== "" && !Number.isNaN(Number(param))) {
    return clampPage(Number(param), pages);
  }
  return clampPage(lastPage > 0 ? lastPage : 1, pages);
}

function Reader({ book }: { book: BookItem }) {
  const { slug, label, pages } = book;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isOpen } = useLightbox();
  const reading = useStore(readingStore);
  const bookmarks = useStore(bookmarksStore);

  const [page, setPage] = useState(() =>
    readInitialPage(searchParams.get("p"), readingStore.get().books[slug]?.lastPage ?? 0, pages),
  );
  const [pageInput, setPageInput] = useState(String(page));
  const [query, setQuery] = useState("");
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

  // Record + sync the URL on the initial page and every turn/jump.
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setPageInput(String(page));
    recordPageView(slug, page);
    setSearchParams({ p: String(page) }, { replace: true });
    // setSearchParams identity is not part of the intended dependency set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, page]);

  // Recently-viewed records once, on leaving the reader, at the page the student
  // actually got to (pageRef.current), so it reflects where they left off.
  useEffect(() => {
    return () => { pushRecent({ slug, label, page: pageRef.current }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (p: number) => setPage(clampPage(p, pages));

  const saved = isBookmarked(bookmarks, slug, page);
  const toggleBookmark = () =>
    saved ? removeBookmark(`${slug}:${page}`) : addBookmark({ slug, label, page, note: "" });

  // Keyboard: arrows turn pages, b toggles bookmark; skip while an input is focused
  // or the shell lightbox is open. Reads live page/bookmark state via refs/store.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isOpen) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const p = pageRef.current;
      if (e.key === "ArrowLeft") { e.preventDefault(); setPage(clampPage(p - 1, pages)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPage(clampPage(p + 1, pages)); }
      else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        if (isBookmarked(bookmarksStore.get(), slug, p)) removeBookmark(`${slug}:${p}`);
        else addBookmark({ slug, label, page: p, note: "" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, pages, slug, label]);

  const commitJump = () => {
    const n = Number(pageInput);
    if (pageInput.trim() === "" || Number.isNaN(n)) { setPageInput(String(page)); return; }
    const clamped = clampPage(n, pages);
    setPageInput(String(clamped));
    setPage(clamped);
  };

  const onImgLoad = () => {
    setLoaded(true);
    setFailed(false);
    if (page < pages) { const img = new Image(); img.src = `/api/page/${slug}/${page + 1}.png`; }
  };

  const pct = Math.round(bookPct(reading, slug, pages));

  return (
    <div>
      <Link
        to="/books"
        className="mb-2 inline-block font-mono text-[10px] tracking-[0.08em] text-cy hover:text-fg"
      >
        ◂ ALL BOOKS
      </Link>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold uppercase leading-none tracking-[0.02em]">{label}</h1>
          <div className="mt-1.5 font-mono text-[10px] tracking-[0.18em] text-faint">
            P.{page}/{pages} · {pct}% READ
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleBookmark}
            className={`font-mono text-[10px] tracking-[0.08em] transition-colors duration-120 ${
              saved ? "text-yl" : "text-faint hover:text-yl"
            }`}
          >
            {saved ? "[SAVED]" : "[+ SAVE PAGE]"}
          </button>
          <AddToIndexButton slug={slug} label={label} page={page} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                navigate("/search?" + new URLSearchParams({ q: query.trim(), book: slug }).toString());
              }
            }}
            placeholder="SEARCH THIS BOOK //"
            aria-label="Search this book"
            className="input-hud w-[200px] px-3 py-1.5 font-mono text-[11px]"
          />
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 border border-edge bg-panel-2 px-3 py-2">
        <ButtonSecondary onClick={() => go(page - 1)} disabled={page <= 1} className="px-3 py-1.5 text-xs">
          ◂ PREV
        </ButtonSecondary>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.12em] text-faint">PAGE</span>
          <input
            type="number"
            min={1}
            max={pages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { commitJump(); e.currentTarget.blur(); } }}
            onBlur={commitJump}
            aria-label="Jump to page"
            className="input-hud w-16 px-2 py-1 text-center font-mono text-xs"
          />
          <span className="font-mono text-[10px] tracking-[0.12em] text-faint">/ {pages}</span>
        </div>
        <ButtonSecondary onClick={() => go(page + 1)} disabled={page >= pages} className="px-3 py-1.5 text-xs">
          NEXT ▸
        </ButtonSecondary>
      </div>

      {failed ? (
        <div className="border border-rd bg-rd-dim p-8 text-center">
          <div className="mb-2 font-mono text-[10px] text-rd">{"// PAGE_UNAVAILABLE"}</div>
          <p className="text-muted">
            This page image could not be rendered. Check that the source PDFs are reachable and the
            courseware password is configured (see the corpus status in the top bar).
          </p>
        </div>
      ) : (
        <div className="relative min-h-[60vh] border border-edge-2 bg-panel p-3">
          {!loaded && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center
                             font-mono text-[10px] text-faint">
              LOADING P.{page} //
            </span>
          )}
          <img
            key={page}
            src={`/api/page/${slug}/${page}.png`}
            alt={`${label} page ${page}`}
            className="block w-full max-w-full object-contain"
            onLoad={onImgLoad}
            onError={() => setFailed(true)}
          />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <ButtonSecondary onClick={() => go(page - 1)} disabled={page <= 1} className="px-3 py-1.5 text-xs">
          ◂ PREV
        </ButtonSecondary>
        <span className="font-mono text-[10px] tracking-[0.12em] text-faint">
          [←→] TURN PAGE · [B] BOOKMARK
        </span>
        <ButtonSecondary onClick={() => go(page + 1)} disabled={page >= pages} className="px-3 py-1.5 text-xs">
          NEXT ▸
        </ButtonSecondary>
      </div>
    </div>
  );
}

function ReaderLoading() {
  return (
    <div>
      <Link
        to="/books"
        className="mb-2 inline-block font-mono text-[10px] tracking-[0.08em] text-cy hover:text-fg"
      >
        ◂ ALL BOOKS
      </Link>
      <div className="border border-edge bg-panel p-6">
        <span className="mono-label text-[10px] text-faint">{"// LOADING_VOLUME"}</span>
      </div>
    </div>
  );
}

function UnknownVolume() {
  return (
    <div className="border border-rd bg-rd-dim p-6">
      <div className="mono-label text-[10px] text-rd">{"// UNKNOWN_VOLUME"}</div>
      <p className="mt-2 text-muted">No such book.</p>
      <Link
        to="/books"
        className="mt-3 inline-block font-mono text-[10px] tracking-[0.08em] text-cy hover:text-fg"
      >
        ◂ ALL BOOKS
      </Link>
    </div>
  );
}

function CorpusOffline() {
  return (
    <div className="border border-rd bg-rd-dim p-6">
      <div className="mono-label text-[10px] text-rd">{"// LIBRARY_UNAVAILABLE"}</div>
      <p className="mt-2 text-muted">
        Corpus index not found. Run scripts/build.sh (see corpus status in the top bar).
      </p>
    </div>
  );
}
