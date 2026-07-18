import "./testLocalStorage";
import { addBookmark, bookmarkCount, bookmarksStore, isBookmarked, removeBookmark } from "./bookmarks";

beforeEach(() => {
  window.localStorage.clear();
  bookmarksStore.set(() => ({ items: [] }));
});

test("addBookmark creates an entry with a slug:page id", () => {
  addBookmark({ slug: "book1", label: "Book 1", page: 10, note: "important" });
  const state = bookmarksStore.get();
  expect(state.items).toHaveLength(1);
  expect(state.items[0].id).toBe("book1:10");
  expect(state.items[0].note).toBe("important");
});

test("addBookmark on the same slug+page replaces the existing entry", () => {
  addBookmark({ slug: "book1", label: "Book 1", page: 10, note: "first note" });
  addBookmark({ slug: "book1", label: "Book 1", page: 10, note: "updated note" });
  const state = bookmarksStore.get();
  expect(state.items).toHaveLength(1);
  expect(state.items[0].note).toBe("updated note");
});

test("removeBookmark removes by id", () => {
  addBookmark({ slug: "book1", label: "Book 1", page: 10, note: "" });
  removeBookmark("book1:10");
  expect(bookmarksStore.get().items).toHaveLength(0);
});

test("isBookmarked and bookmarkCount reflect state", () => {
  expect(isBookmarked(bookmarksStore.get(), "book1", 10)).toBe(false);
  addBookmark({ slug: "book1", label: "Book 1", page: 10, note: "" });
  addBookmark({ slug: "book2", label: "Book 2", page: 3, note: "" });
  expect(isBookmarked(bookmarksStore.get(), "book1", 10)).toBe(true);
  expect(bookmarkCount(bookmarksStore.get())).toBe(2);
});
