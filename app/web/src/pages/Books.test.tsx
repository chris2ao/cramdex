import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readingStore } from "../stores/reading";
import { Books } from "./Books";

const BOOKS = { items: [
  { slug: "book1", label: "Book 1", pages: 158 },
  { slug: "book2", label: "Book 2", pages: 148 },
  { slug: "workbook", label: "Workbook", pages: 237 },
]};

beforeEach(() => {
  window.localStorage.clear();
  readingStore.set(() => ({ books: {} }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => BOOKS })) as any);
});

/** The whole tile is one <a>; find it via its (unique) label text. */
function tileFor(label: string): HTMLAnchorElement {
  const anchor = screen.getByText(label).closest("a");
  if (!anchor) throw new Error(`no tile link for ${label}`);
  return anchor as HTMLAnchorElement;
}

test("renders a tile per API item, each linking to its reader with a mono code", async () => {
  render(<MemoryRouter><Books /></MemoryRouter>);
  await screen.findByText("Book 1");
  expect(tileFor("Book 1")).toHaveAttribute("href", "/books/book1");
  expect(tileFor("Book 2")).toHaveAttribute("href", "/books/book2");
  expect(tileFor("Workbook")).toHaveAttribute("href", "/books/workbook");
  expect(screen.getByText("BK_1")).toBeInTheDocument();
  expect(screen.getByText("WKBK")).toBeInTheDocument();
});

test("reflects seeded reading progress in the tile's bar and page marker", async () => {
  const pages = Array.from({ length: 74 }, (_, i) => i + 1); // 74 of 148 -> 50%
  readingStore.set(() => ({ books: { book2: { pages, lastPage: 74, updatedAt: 0 } } }));
  render(<MemoryRouter><Books /></MemoryRouter>);
  await screen.findByText("Book 2");
  const link = tileFor("Book 2");
  expect(within(link).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  expect(within(link).getByText(/P\.74\/148/)).toBeInTheDocument();
});

test("an unstarted book reads NOT STARTED with a zeroed bar", async () => {
  render(<MemoryRouter><Books /></MemoryRouter>);
  await screen.findByText("Book 1");
  const link = tileFor("Book 1");
  expect(within(link).getByText(/NOT STARTED/)).toBeInTheDocument();
  expect(within(link).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
});

test("a peeked-only book (lastPage 0, some maxPage) still reads NOT STARTED", async () => {
  readingStore.set(() => ({ books: { book1: { pages: [20], lastPage: 0, updatedAt: 0 } } }));
  render(<MemoryRouter><Books /></MemoryRouter>);
  await screen.findByText("Book 1");
  const link = tileFor("Book 1");
  expect(within(link).getByText(/NOT STARTED/)).toBeInTheDocument();
  expect(within(link).queryByText(/P\.0\//)).not.toBeInTheDocument();
});

test("a failed books fetch shows the library-unavailable panel", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false, statusText: "Service Unavailable", json: async () => ({ detail: "no corpus" }),
  })) as any);
  render(<MemoryRouter><Books /></MemoryRouter>);
  expect(await screen.findByText(/LIBRARY_UNAVAILABLE/)).toBeInTheDocument();
});
