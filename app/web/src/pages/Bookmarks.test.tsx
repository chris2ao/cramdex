import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "../components/Lightbox";
import { addBookmark, bookmarksStore } from "../stores/bookmarks";
import { Bookmarks } from "./Bookmarks";

beforeEach(() => {
  window.localStorage.clear();
  bookmarksStore.set(() => ({ items: [] }));
});

test("renders seeded bookmarks with a citation chip and note", () => {
  addBookmark({ slug: "book2", label: "Book 2", page: 76, note: "Ops tempo table" });

  render(<MemoryRouter><LightboxProvider><Bookmarks /></LightboxProvider></MemoryRouter>);

  expect(screen.getByRole("button", { name: /Book 2 p\.76/ })).toBeInTheDocument();
  expect(screen.getByText("Ops tempo table")).toBeInTheDocument();
  expect(screen.getByText(/1 TOTAL/)).toBeInTheDocument();
});

test("remove deletes the bookmark from the store and the list", async () => {
  addBookmark({ slug: "book2", label: "Book 2", page: 76, note: "note" });

  render(<MemoryRouter><LightboxProvider><Bookmarks /></LightboxProvider></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "[REMOVE]" }));

  expect(bookmarksStore.get().items).toHaveLength(0);
  expect(screen.queryByRole("button", { name: /Book 2 p\.76/ })).not.toBeInTheDocument();
});

test("shows an empty state when there are no bookmarks", () => {
  render(<MemoryRouter><LightboxProvider><Bookmarks /></LightboxProvider></MemoryRouter>);

  expect(screen.getByText(/NO PINNED INTEL/)).toBeInTheDocument();
  expect(screen.getByText(/0 TOTAL/)).toBeInTheDocument();
});
