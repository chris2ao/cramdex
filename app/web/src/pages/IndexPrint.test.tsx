import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../stores/testLocalStorage";
import { addOrMergeEntry, examIndexStore } from "../stores/examIndex";
import { resetCourseCache } from "../lib/course";
import { IndexPrint } from "./IndexPrint";

const COURSE = { name: "Demo Course", exam_date: null, books: [
  { slug: "book1", label: "Book 1" }, { slug: "book2", label: "Book 2" },
]};

beforeEach(() => {
  window.localStorage.clear();
  examIndexStore.set(() => ({ entries: [], dismissed: [] }));
  resetCourseCache();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/course")) return { ok: true, json: async () => COURSE };
    return { ok: false, status: 404, json: async () => ({}) };
  }) as any);
});

test("print view lists entries alphabetically with definitions and citations", () => {
  addOrMergeEntry({ term: "Regolith Sweep", definition: "Cleanup pass.",
    citations: [{ slug: "book1", label: "Book 1", page: 6 }], topic: "Demo Cycle" });
  addOrMergeEntry({ term: "Crater Watch", definition: "",
    citations: [{ slug: "book2", label: "Book 2", page: 6 }], topic: "" });
  render(<MemoryRouter><IndexPrint /></MemoryRouter>);

  expect(screen.getByText(/2 entries/i)).toBeInTheDocument();
  const terms = screen.getAllByTestId("print-term").map((el) => el.textContent);
  expect(terms).toEqual(["Crater Watch", "Regolith Sweep"]);
  expect(screen.getByText(/Book 1 p\.6/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /back to index/i })).toHaveAttribute(
    "href", "/index");
});
