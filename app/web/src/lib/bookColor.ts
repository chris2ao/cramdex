import type { CourseBook } from "./course";

/**
 * Fixed, print-friendly palette for per-book color coding (one color per
 * book, a common open-book exam indexing convention). Assignment is
 * positional in the course's book order, so colors are stable across
 * sessions without any storage.
 */
export const BOOK_PALETTE = [
  "#e63946", "#1d7fd6", "#2a9d3f", "#f77f00",
  "#7b2d8e", "#0d8a8a", "#b8860b", "#d6336c",
] as const;

export const UNKNOWN_BOOK_COLOR = "#6b7280";

export function bookColor(books: readonly CourseBook[], slug: string): string {
  const i = books.findIndex((b) => b.slug === slug);
  return i === -1 ? UNKNOWN_BOOK_COLOR : BOOK_PALETTE[i % BOOK_PALETTE.length];
}
