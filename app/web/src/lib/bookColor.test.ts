import { BOOK_PALETTE, UNKNOWN_BOOK_COLOR, bookColor } from "./bookColor";

const BOOKS = Array.from({ length: 10 }, (_, i) => ({ slug: `b${i}`, label: `Book ${i}` }));

test("assigns palette colors by book position", () => {
  expect(bookColor(BOOKS, "b0")).toBe(BOOK_PALETTE[0]);
  expect(bookColor(BOOKS, "b3")).toBe(BOOK_PALETTE[3]);
});

test("wraps the palette past eight books", () => {
  expect(bookColor(BOOKS, "b8")).toBe(BOOK_PALETTE[0]);
  expect(bookColor(BOOKS, "b9")).toBe(BOOK_PALETTE[1]);
});

test("unknown slugs get the fallback color", () => {
  expect(bookColor(BOOKS, "nope")).toBe(UNKNOWN_BOOK_COLOR);
});
