import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "../stores/testLocalStorage";
import { addOrMergeEntry, examIndexStore } from "../stores/examIndex";
import { resetCourseCache } from "../lib/course";
import { printSettingsStore } from "../stores/printSettings";
import { IndexPrint } from "./IndexPrint";

const COURSE = { name: "Demo Course", exam_date: null, books: [
  { slug: "book1", label: "Book 1" }, { slug: "book2", label: "Book 2" },
]};

beforeEach(() => {
  window.localStorage.clear();
  examIndexStore.set(() => ({ entries: [], dismissed: [] }));
  printSettingsStore.set(() => ({ letterBreaks: false, coverSheet: true, fontSize: "m", columns: 2 }));
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

test("renders a cover sheet and letter headings", () => {
  addOrMergeEntry({ term: "Crater Watch", definition: "",
    citations: [{ slug: "book1", label: "Book 1", page: 6 }], topic: "" });
  addOrMergeEntry({ term: "Demo Cycle", definition: "",
    citations: [{ slug: "book2", label: "Book 2", page: 9 }], topic: "" });
  render(<MemoryRouter><IndexPrint /></MemoryRouter>);

  expect(screen.getByTestId("print-cover")).toHaveTextContent(/exam index/i);
  const headings = screen.getAllByTestId("letter-heading").map((h) => h.textContent);
  expect(headings).toEqual(["C", "D"]);
});

test("cover sheet toggle removes the cover block", async () => {
  addOrMergeEntry({ term: "Crater Watch", definition: "",
    citations: [{ slug: "book1", label: "Book 1", page: 6 }], topic: "" });
  render(<MemoryRouter><IndexPrint /></MemoryRouter>);

  await userEvent.click(screen.getByRole("checkbox", { name: "COVER SHEET" }));
  expect(screen.queryByTestId("print-cover")).toBeNull();
});

test("font and column controls update the sheet classes", async () => {
  addOrMergeEntry({ term: "Crater Watch", definition: "",
    citations: [{ slug: "book1", label: "Book 1", page: 6 }], topic: "" });
  render(<MemoryRouter><IndexPrint /></MemoryRouter>);

  await userEvent.selectOptions(screen.getByRole("combobox", { name: "FONT" }), "l");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "COLUMNS" }), "1");
  const sheet = screen.getByTestId("print-entries");
  expect(sheet.className).toContain("columns-1");
  expect(sheet.className).toContain("text-[15px]");
});

test("letter breaks toggle adds page break before subsequent letter sections", async () => {
  addOrMergeEntry({ term: "Crater Watch", definition: "",
    citations: [{ slug: "book1", label: "Book 1", page: 6 }], topic: "" });
  addOrMergeEntry({ term: "Demo Cycle", definition: "",
    citations: [{ slug: "book2", label: "Book 2", page: 9 }], topic: "" });
  render(<MemoryRouter><IndexPrint /></MemoryRouter>);

  await userEvent.click(screen.getByRole("checkbox", { name: "LETTER BREAKS" }));

  const headings = screen.getAllByTestId("letter-heading");
  const firstSection = headings[0].parentElement;
  const secondSection = headings[1].parentElement;

  expect(firstSection).not.toHaveClass("break-before-page");
  expect(secondSection).toHaveClass("break-before-page");
});
