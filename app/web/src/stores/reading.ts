import { createStore } from "./store";
import type { Store } from "./store";

/**
 * pages: sorted, unique page numbers actually viewed. lastPage is the resume pointer;
 * a book with lastPage <= 0 has never been actively read (only peeked at) and must
 * not be offered as a resume target.
 */
export type BookProgress = { pages: number[]; lastPage: number; updatedAt: number };
export type ReadingState = { books: Record<string, BookProgress> };

const INITIAL: ReadingState = { books: {} };

function isBookProgress(v: unknown): v is BookProgress {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Partial<BookProgress>;
  return (
    Array.isArray(p.pages) &&
    p.pages.every((n) => typeof n === "number") &&
    typeof p.lastPage === "number" &&
    typeof p.updatedAt === "number"
  );
}

function isReadingState(v: unknown): v is ReadingState {
  if (typeof v !== "object" || v === null) return false;
  const books = (v as Partial<ReadingState>).books;
  if (typeof books !== "object" || books === null) return false;
  return Object.values(books).every(isBookProgress);
}

export const readingStore: Store<ReadingState> = createStore("cramdex.reading", isReadingState, INITIAL);

/** Returns a new sorted, deduped pages array with `page` included. */
function withPage(pages: number[], page: number): number[] {
  const unique = new Set(pages);
  unique.add(page);
  return Array.from(unique).sort((a, b) => a - b);
}

/** Records an actual page view: adds to pages, moves the resume pointer, stamps updatedAt. */
export function recordPageView(slug: string, page: number): void {
  readingStore.set((state) => {
    const prev = state.books[slug];
    return {
      books: {
        ...state.books,
        [slug]: { pages: withPage(prev?.pages ?? [], page), lastPage: page, updatedAt: Date.now() },
      },
    };
  });
}

/**
 * Records a page peek (e.g. a Lightbox preview): adds to pages only, leaving lastPage
 * and updatedAt untouched. Creates the book entry with lastPage 0 if absent, which
 * consumers must treat as "not started reading" (not a valid resume target).
 */
export function recordPagePeek(slug: string, page: number): void {
  readingStore.set((state) => {
    const prev = state.books[slug];
    return {
      books: {
        ...state.books,
        [slug]: { pages: withPage(prev?.pages ?? [], page), lastPage: prev?.lastPage ?? 0, updatedAt: prev?.updatedAt ?? 0 },
      },
    };
  });
}

/** Percent of a book's unique pages actually viewed (0-100), clamped; 0 when totalPages is not positive. */
export function bookPct(state: ReadingState, slug: string, totalPages: number): number {
  if (totalPages <= 0) return 0;
  const viewed = state.books[slug]?.pages.length ?? 0;
  return Math.min(100, Math.max(0, (viewed / totalPages) * 100));
}
