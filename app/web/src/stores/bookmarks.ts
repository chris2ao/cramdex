import { createStore } from "./store";
import type { Store } from "./store";

export type Bookmark = { id: string; slug: string; label: string; page: number; note: string; at: number };
export type BookmarksState = { items: Bookmark[] };
type BookmarkInput = { slug: string; label: string; page: number; note: string };

const INITIAL: BookmarksState = { items: [] };

function isBookmark(v: unknown): v is Bookmark {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Partial<Bookmark>;
  return (
    typeof b.id === "string" &&
    typeof b.slug === "string" &&
    typeof b.label === "string" &&
    typeof b.page === "number" &&
    typeof b.note === "string" &&
    typeof b.at === "number"
  );
}

function isBookmarksState(v: unknown): v is BookmarksState {
  if (typeof v !== "object" || v === null) return false;
  const items = (v as Partial<BookmarksState>).items;
  return Array.isArray(items) && items.every(isBookmark);
}

export const bookmarksStore: Store<BookmarksState> = createStore("cramdex.bookmarks", isBookmarksState, INITIAL);

/** Adds a bookmark, or replaces the existing one for the same slug+page. */
export function addBookmark(input: BookmarkInput): void {
  const id = `${input.slug}:${input.page}`;
  bookmarksStore.set((state) => {
    const filtered = state.items.filter((b) => b.id !== id);
    return { items: [{ id, ...input, at: Date.now() }, ...filtered] };
  });
}

export function removeBookmark(id: string): void {
  bookmarksStore.set((state) => ({ items: state.items.filter((b) => b.id !== id) }));
}

export function isBookmarked(state: BookmarksState, slug: string, page: number): boolean {
  const id = `${slug}:${page}`;
  return state.items.some((b) => b.id === id);
}

export function bookmarkCount(state: BookmarksState): number {
  return state.items.length;
}
