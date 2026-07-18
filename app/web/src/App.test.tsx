import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "./App";

// The routes AppShell mounts (Dashboard at "/" by default) fetch course
// metadata, book/lab listings, and the quiz topic taxonomy on load; a well
// formed default response for each keeps those routes from throwing while
// rendering with an empty pack. Individual tests override only the
// endpoint(s) they care about.
function stubShellFetch(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    "/api/course": { name: "Demo Course", exam_date: null, books: [] },
    "/api/content/books": { items: [] },
    "/api/content/labs": { items: [] },
    "/api/content/topics": { promoted: [], themes: {}, fallback: "General", order: [] },
    "/api/quiz/deck": { items: [] },
    "/api/health": { ok: true, checks: {} },
    ...overrides,
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(responses).find((k) => url.startsWith(k));
    return { ok: true, json: async () => (key ? responses[key] : {}) };
  }) as any);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("sidebar lists every section", () => {
  render(<MemoryRouter><AppShell /></MemoryRouter>);
  for (const label of ["Dashboard", "Books", "Ask", "Quiz", "Search",
                       "Slide Index", "Frameworks", "Glossary", "Notes",
                       "Labs", "Bookmarks", "Assets"]) {
    expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
  }
});

test("top bar shows global search and bookmarks", () => {
  render(<MemoryRouter><AppShell /></MemoryRouter>);
  expect(
    screen.getByRole("button", { name: /search all books/i })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /BOOKMARKS \[\d+\]/ })
  ).toBeInTheDocument();
});

test("the mounted health banner surfaces a missing course pack", async () => {
  stubShellFetch({
    "/api/health": { ok: false, checks: { course_pack: false } },
  });
  render(<MemoryRouter><AppShell /></MemoryRouter>);
  expect(
    await screen.findByText(/no course pack configured/i)
  ).toBeInTheDocument();
});
