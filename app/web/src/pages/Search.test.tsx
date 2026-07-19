import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "../components/Lightbox";
import { bookmarksStore } from "../stores/bookmarks";
import { resetCourseCache } from "../lib/course";
import { Search } from "./Search";

const HIT = {
  slug: "book2", label: "Book 2", pdf_page: 78, printed_page: 76,
  snippet: "the [[ops]] [[tempo]] cadence", score: -5,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ query: "ops tempo", mode: "phrase", results: [HIT] }),
  })) as any);
  window.localStorage.clear();
  bookmarksStore.set(() => ({ items: [] }));
  resetCourseCache();
});

test("book filter pills derive from the active course, not a fixed list", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
    if (String(url).includes("/api/course")) {
      return {
        ok: true,
        json: async () => ({
          name: "Demo Course", exam_date: null,
          books: [
            { slug: "book1", label: "Book 1" },
            { slug: "book2", label: "Book 2" },
            { slug: "workbook", label: "Workbook" },
          ],
        }),
      };
    }
    return { ok: true, json: async () => ({ query: "q", mode: "phrase", results: [] }) };
  }) as any);

  render(<MemoryRouter><LightboxProvider><Search /></LightboxProvider></MemoryRouter>);
  const group = await screen.findByRole("group", { name: /filter by book/i });
  expect(await within(group).findByRole("button", { name: "Book 1" })).toBeInTheDocument();
  expect(within(group).getByRole("button", { name: "Book 2" })).toBeInTheDocument();
  expect(within(group).getByRole("button", { name: "Workbook" })).toBeInTheDocument();
  expect(within(group).getByRole("button", { name: "ALL" })).toBeInTheDocument();
  expect(within(group).queryByRole("button", { name: "BK3" })).not.toBeInTheDocument();
  expect(within(group).queryByRole("button", { name: "BKB" })).not.toBeInTheDocument();
});

test("searching renders hits with highlighted snippet and citation chip", async () => {
  render(<MemoryRouter><LightboxProvider><Search /></LightboxProvider></MemoryRouter>);
  await userEvent.type(screen.getByPlaceholderText(/type query/i), "ops tempo{enter}");
  expect(await screen.findByText("ops")).toHaveProperty("tagName", "MARK");
  expect(screen.getByRole("button", { name: /Book 2 p\.76/ })).toBeInTheDocument();
});

test("a slow stale response does not overwrite newer results", async () => {
  const slow = { ...HIT, snippet: "the [[stale]] result" };
  const fast = { ...HIT, snippet: "the [[fresh]] result" };
  let resolveSlow: (v: unknown) => void = () => {};
  const slowPromise = new Promise((r) => { resolveSlow = r; });
  // The course fetch must not consume the sequenced search responses.
  const searchResponses: Array<() => unknown> = [
    () => slowPromise,
    async () => ({
      ok: true,
      json: async () => ({ query: "q", mode: "phrase", results: [fast] }),
    }),
  ];
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
    if (String(url).includes("/api/course")) {
      return { ok: true, json: async () => ({ name: "C", exam_date: null, books: [] }) };
    }
    return searchResponses.shift()!();
  }) as any);

  render(<MemoryRouter><LightboxProvider><Search /></LightboxProvider></MemoryRouter>);
  const input = screen.getByPlaceholderText(/type query/i);
  await userEvent.type(input, "first{enter}");
  await userEvent.type(input, " second{enter}");
  expect(await screen.findByText("fresh")).toBeInTheDocument();

  resolveSlow({ ok: true, json: async () => ({ query: "q", mode: "phrase", results: [slow] }) });
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByText("stale")).not.toBeInTheDocument();
  expect(screen.getByText("fresh")).toBeInTheDocument();
});

test("meta line reports hit count, elapsed time, and the uppercased query", async () => {
  render(<MemoryRouter><LightboxProvider><Search /></LightboxProvider></MemoryRouter>);
  await userEvent.type(screen.getByPlaceholderText(/type query/i), "ops tempo{enter}");
  await screen.findByRole("button", { name: /Book 2 p\.76/ });

  const meta = screen.getByText(/HITS RETURNED/);
  expect(meta.textContent).toMatch(/^> 1 HITS RETURNED · \d+\.\d{2}s · QUERY: "OPS TEMPO"$/);
});

test("saving a result adds a bookmark and toggles the button to [SAVED]", async () => {
  render(<MemoryRouter><LightboxProvider><Search /></LightboxProvider></MemoryRouter>);
  await userEvent.type(screen.getByPlaceholderText(/type query/i), "ops tempo{enter}");
  await screen.findByRole("button", { name: /Book 2 p\.76/ });

  await userEvent.click(screen.getByRole("button", { name: "[+SAVE]" }));

  expect(screen.getByRole("button", { name: "[SAVED]" })).toBeInTheDocument();
  expect(bookmarksStore.get().items).toHaveLength(1);
  expect(bookmarksStore.get().items[0]).toMatchObject({ id: "book2:76", slug: "book2", page: 76 });
});

test("capture point opens the add-to-index dialog with the page citation", async () => {
  render(<MemoryRouter><LightboxProvider><Search /></LightboxProvider></MemoryRouter>);
  await userEvent.type(screen.getByPlaceholderText(/type query/i), "ops tempo{enter}");
  await screen.findByRole("button", { name: /Book 2 p\.76/ });

  await userEvent.click(screen.getAllByRole("button", { name: "[+INDEX]" })[0]);

  expect(screen.getByRole("dialog", { name: /add to index/i })).toBeInTheDocument();
  expect(screen.getByText(/BOOK 2 P\.76/)).toBeInTheDocument();
});
