import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LightboxProvider } from "../components/Lightbox";
import { readingStore } from "../stores/reading";
import { bookmarksStore, isBookmarked } from "../stores/bookmarks";
import { recentStore } from "../stores/recent";
import { resetCourseCache } from "../lib/course";
import { BookReader } from "./BookReader";

const BOOKS = { items: [
  { slug: "book1", label: "Book 1", pages: 158 },
  { slug: "book2", label: "Book 2", pages: 148 },
]};

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderReader(entry = "/books/book2") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LightboxProvider>
        <LocationProbe />
        <Routes>
          <Route path="/books/:slug" element={<BookReader />} />
          <Route path="/search" element={<div>SEARCH RESULTS</div>} />
        </Routes>
      </LightboxProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  readingStore.set(() => ({ books: {} }));
  bookmarksStore.set(() => ({ items: [] }));
  recentStore.set(() => ({ items: [] }));
  resetCourseCache();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => BOOKS })) as any);
});

test("records the first viewed page and syncs ?p= into the URL", async () => {
  renderReader("/books/book2");
  await screen.findByText(/P\.1\/148/);
  expect(readingStore.get().books.book2?.lastPage).toBe(1);
  await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/books/book2?p=1"));
});

test("initializes the page from the ?p= query param", async () => {
  renderReader("/books/book2?p=30");
  await screen.findByText(/P\.30\/148/);
  expect(readingStore.get().books.book2?.lastPage).toBe(30);
});

test("initializes from the reading store's last page when no ?p= is present", async () => {
  readingStore.set(() => ({ books: { book2: { pages: [12], lastPage: 12, updatedAt: 0 } } }));
  renderReader("/books/book2");
  await screen.findByText(/P\.12\/148/);
});

test("turning the page updates the store and the ?p= param", async () => {
  renderReader("/books/book2");
  await screen.findByText(/P\.1\/148/);
  await userEvent.click(screen.getAllByRole("button", { name: /NEXT/ })[0]);
  await screen.findByText(/P\.2\/148/);
  expect(readingStore.get().books.book2?.lastPage).toBe(2);
  expect(screen.getByTestId("loc").textContent).toBe("/books/book2?p=2");
});

test("the jump input navigates to a valid page and clamps out-of-range values", async () => {
  renderReader("/books/book2");
  await screen.findByText(/P\.1\/148/);
  const jump = screen.getByLabelText(/jump to page/i);

  await userEvent.clear(jump);
  await userEvent.type(jump, "40{enter}");
  await screen.findByText(/P\.40\/148/);
  expect(readingStore.get().books.book2?.lastPage).toBe(40);

  await userEvent.clear(jump);
  await userEvent.type(jump, "9999{enter}");
  await screen.findByText(/P\.148\/148/);
  expect(readingStore.get().books.book2?.lastPage).toBe(148);
});

test("arrow keys turn pages, but not while a text field is focused", async () => {
  renderReader("/books/book2");
  await screen.findByText(/P\.1\/148/);

  await userEvent.keyboard("{ArrowRight}");
  await screen.findByText(/P\.2\/148/);

  screen.getByLabelText(/search this book/i).focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(screen.getByText(/P\.2\/148/)).toBeInTheDocument();
});

test("bookmarking the current page toggles via the button and the B key", async () => {
  renderReader("/books/book2");
  await screen.findByText(/P\.1\/148/);

  await userEvent.click(screen.getByRole("button", { name: /SAVE PAGE/ }));
  expect(isBookmarked(bookmarksStore.get(), "book2", 1)).toBe(true);
  expect(screen.getByRole("button", { name: /SAVED/ })).toBeInTheDocument();

  await userEvent.keyboard("{b}");
  expect(isBookmarked(bookmarksStore.get(), "book2", 1)).toBe(false);
});

test("the index capture button opens the dialog with the current page citation", async () => {
  renderReader("/books/book2");
  await screen.findByText(/P\.1\/148/);

  await userEvent.click(screen.getByRole("button", { name: "[+INDEX]" }));

  expect(screen.getByRole("dialog", { name: /add to index/i })).toBeInTheDocument();
  expect(screen.getByText(/BOOK 2 P\.1/)).toBeInTheDocument();
});

test("search-in-book routes to /search preselecting this book", async () => {
  renderReader("/books/book2");
  await screen.findByText(/P\.1\/148/);
  await userEvent.type(screen.getByLabelText(/search this book/i), "ops tempo{enter}");
  await screen.findByText("SEARCH RESULTS");
  const loc = screen.getByTestId("loc").textContent ?? "";
  expect(loc).toContain("/search?");
  expect(loc).toContain("q=ops+tempo");
  expect(loc).toContain("book=book2");
});

test("a broken page image shows the page-unavailable state but keeps nav usable", async () => {
  renderReader("/books/book2");
  fireEvent.error(await screen.findByAltText(/Book 2 page 1/i));
  expect(await screen.findByText(/PAGE_UNAVAILABLE/)).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /NEXT/ }).length).toBeGreaterThan(0);
});

test("records recent access on leaving the reader, at the page left off on", async () => {
  const { unmount } = renderReader("/books/book2");
  await screen.findByText(/P\.1\/148/);
  await userEvent.click(screen.getAllByRole("button", { name: /NEXT/ })[0]);
  await screen.findByText(/P\.2\/148/);
  // No recent entry while still reading.
  expect(recentStore.get().items.length).toBe(0);

  unmount();
  expect(recentStore.get().items.length).toBe(1);
  expect(recentStore.get().items[0]).toMatchObject({ slug: "book2", page: 2 });
});

test("renders the page image at full column width, not height-capped", async () => {
  renderReader("/books/book2");
  const img = await screen.findByAltText(/Book 2 page 1/i);
  expect(img.className).toContain("w-full");
  expect(img.className).not.toContain("max-h-[calc");
});

test("an unknown slug shows the unknown-volume state", async () => {
  renderReader("/books/nope");
  expect(await screen.findByText(/UNKNOWN_VOLUME/)).toBeInTheDocument();
});

test("a failed books fetch shows the corpus-offline state", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false, statusText: "Service Unavailable", json: async () => ({ detail: "no corpus" }),
  })) as any);
  renderReader("/books/book2");
  expect(await screen.findByText(/LIBRARY_UNAVAILABLE/)).toBeInTheDocument();
});
