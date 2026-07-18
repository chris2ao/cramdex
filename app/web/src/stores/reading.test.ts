import "./testLocalStorage";
import { bookPct, readingStore, recordPagePeek, recordPageView } from "./reading";

beforeEach(() => {
  window.localStorage.clear();
  readingStore.set(() => ({ books: {} }));
});

test("recordPageView adds the page to pages, sets lastPage, and stamps updatedAt", () => {
  const before = Date.now();
  recordPageView("book1", 10);
  let state = readingStore.get();
  expect(state.books.book1.pages).toEqual([10]);
  expect(state.books.book1.lastPage).toBe(10);
  expect(state.books.book1.updatedAt).toBeGreaterThanOrEqual(before);

  recordPageView("book1", 5);
  state = readingStore.get();
  expect(state.books.book1.pages).toEqual([5, 10]);
  expect(state.books.book1.lastPage).toBe(5);

  recordPageView("book1", 20);
  state = readingStore.get();
  expect(state.books.book1.pages).toEqual([5, 10, 20]);
  expect(state.books.book1.lastPage).toBe(20);
});

test("recordPageView tracks separate books independently", () => {
  recordPageView("book1", 3);
  recordPageView("book2", 7);
  const state = readingStore.get();
  expect(state.books.book1.pages).toEqual([3]);
  expect(state.books.book2.pages).toEqual([7]);
});

test("recordPageView dedupes: viewing the same page twice is one entry", () => {
  recordPageView("book1", 10);
  recordPageView("book1", 10);
  expect(readingStore.get().books.book1.pages).toEqual([10]);
});

test("recordPagePeek adds to pages but does not move lastPage or updatedAt on an existing book", () => {
  recordPageView("book1", 10);
  const { lastPage, updatedAt } = readingStore.get().books.book1;

  recordPagePeek("book1", 55);
  const state = readingStore.get();
  expect(state.books.book1.pages).toEqual([10, 55]);
  expect(state.books.book1.lastPage).toBe(lastPage);
  expect(state.books.book1.updatedAt).toBe(updatedAt);
});

test("recordPagePeek on an absent book creates it with lastPage 0 (not started reading)", () => {
  recordPagePeek("book1", 42);
  const state = readingStore.get();
  expect(state.books.book1.pages).toEqual([42]);
  expect(state.books.book1.lastPage).toBe(0);
});

test("recordPagePeek also dedupes the same page", () => {
  recordPagePeek("book1", 42);
  recordPagePeek("book1", 42);
  expect(readingStore.get().books.book1.pages).toEqual([42]);
});

test("pages stay sorted and unique regardless of view order", () => {
  recordPageView("book1", 30);
  recordPagePeek("book1", 5);
  recordPageView("book1", 15);
  recordPagePeek("book1", 5);
  expect(readingStore.get().books.book1.pages).toEqual([5, 15, 30]);
});

test("bookPct is honest: one viewed page in a 158-page book is not 25 percent", () => {
  recordPageView("book1", 40);
  const state = readingStore.get();
  expect(bookPct(state, "book1", 158)).toBeCloseTo((1 / 158) * 100, 5);
  expect(bookPct(state, "book1", 158)).toBeLessThan(1);
});

test("bookPct is pages.length over totalPages, clamped to 100", () => {
  recordPageView("book1", 1);
  recordPageView("book1", 2);
  const state = readingStore.get();
  expect(bookPct(state, "book1", 4)).toBe(50);
  expect(bookPct(state, "missing-book", 100)).toBe(0);
});

test("bookPct clamps to 100 even if more unique pages are viewed than totalPages", () => {
  for (let p = 1; p <= 5; p++) recordPageView("book1", p);
  const state = readingStore.get();
  expect(bookPct(state, "book1", 3)).toBe(100);
});

test("bookPct returns 0 when totalPages is zero or negative", () => {
  recordPageView("book1", 50);
  const state = readingStore.get();
  expect(bookPct(state, "book1", 0)).toBe(0);
  expect(bookPct(state, "book1", -10)).toBe(0);
});

test("set() does not mutate a previously read snapshot (immutability)", () => {
  recordPageView("book1", 10);
  const before = readingStore.get();
  const beforePages = before.books.book1.pages;

  recordPageView("book1", 20);
  expect(before.books.book1.pages).toBe(beforePages);
  expect(beforePages).toEqual([10]);
  expect(readingStore.get().books.book1.pages).toEqual([10, 20]);
});

test("the old {maxPage,...} persisted shape is rejected, falling back to initial", async () => {
  window.localStorage.setItem(
    "cramdex.reading",
    JSON.stringify({ books: { book1: { maxPage: 79, lastPage: 79, updatedAt: 123 } } }),
  );
  vi.resetModules();
  const fresh = await import("./reading");
  expect(fresh.readingStore.get()).toEqual({ books: {} });
});
