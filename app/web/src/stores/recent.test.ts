import "./testLocalStorage";
import { pushRecent, recentStore } from "./recent";

beforeEach(() => {
  window.localStorage.clear();
  recentStore.set(() => ({ items: [] }));
});

test("pushRecent adds an entry to the front", () => {
  pushRecent({ slug: "book1", label: "Book 1", page: 10 });
  const state = recentStore.get();
  expect(state.items).toHaveLength(1);
  expect(state.items[0]).toMatchObject({ slug: "book1", label: "Book 1", page: 10 });
  expect(typeof state.items[0].at).toBe("number");
});

test("pushRecent dedupes by slug+page, moving the entry to front and refreshing its data", () => {
  pushRecent({ slug: "book1", label: "Book 1", page: 10 });
  pushRecent({ slug: "book2", label: "Book 2", page: 1 });
  const firstAt = recentStore.get().items.find((i) => i.slug === "book1")!.at;

  pushRecent({ slug: "book1", label: "Book 1 updated", page: 10 });
  const state = recentStore.get();
  expect(state.items).toHaveLength(2);
  expect(state.items[0].slug).toBe("book1");
  expect(state.items[0].label).toBe("Book 1 updated");
  expect(state.items[0].at).toBeGreaterThanOrEqual(firstAt);
});

test("different page on the same slug is a distinct entry", () => {
  pushRecent({ slug: "book1", label: "Book 1", page: 10 });
  pushRecent({ slug: "book1", label: "Book 1", page: 11 });
  expect(recentStore.get().items).toHaveLength(2);
});

test("pushRecent caps the list at 20 items, dropping the oldest", () => {
  for (let i = 0; i < 25; i++) {
    pushRecent({ slug: `book${i}`, label: `Book ${i}`, page: 1 });
  }
  const state = recentStore.get();
  expect(state.items).toHaveLength(20);
  expect(state.items[0].slug).toBe("book24");
  expect(state.items.some((i) => i.slug === "book0")).toBe(false);
});
