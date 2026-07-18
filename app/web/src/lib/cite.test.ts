import { parseCitations } from "./cite";
import type { CourseBook } from "./course";

const BOOKS: CourseBook[] = [
  { slug: "book1", label: "Book 1" },
  { slug: "book2", label: "Book 2" },
  { slug: "book3", label: "Book 3" },
  { slug: "bookB", label: "Book B" },
  { slug: "workbook", label: "Workbook" },
];

test("parses a single citation", () => {
  const segs = parseCitations("See Book 2 p.76 for detail", BOOKS);
  expect(segs).toEqual([
    { kind: "text", text: "See " },
    { kind: "cite", label: "Book 2", slug: "book2", page: 76, text: "Book 2 p.76" },
    { kind: "text", text: " for detail" },
  ]);
});

test("parses ranges, Workbook, and Book B, linking the first page", () => {
  const segs = parseCitations("Book 1 p.70-71; Workbook p.115; Book B p.9", BOOKS);
  const cites = segs.filter((s) => s.kind === "cite");
  expect(cites.map((c: any) => [c.slug, c.page])).toEqual([
    ["book1", 70], ["workbook", 115], ["bookB", 9],
  ]);
});

test("handles en dash ranges and 'p. 76' spacing", () => {
  const cites = parseCitations("Book 2 p.74–77 and Book 3 p. 48", BOOKS)
    .filter((s) => s.kind === "cite");
  expect(cites.map((c: any) => c.page)).toEqual([74, 48]);
});

test("plain text passes through untouched", () => {
  expect(parseCitations("no citations here", BOOKS)).toEqual([
    { kind: "text", text: "no citations here" },
  ]);
});

test("returns the whole text as a single segment when no books are configured", () => {
  expect(parseCitations("Book 1 p.5 mentioned here", [])).toEqual([
    { kind: "text", text: "Book 1 p.5 mentioned here" },
  ]);
});
