import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LightboxProvider } from "../components/Lightbox";
import "../stores/testLocalStorage";
import { addOrMergeEntry, examIndexStore } from "../stores/examIndex";
import { resetCourseCache } from "../lib/course";
import { ExamIndex } from "./ExamIndex";

const COURSE = { name: "Demo Course", exam_date: null, books: [
  { slug: "book1", label: "Book 1" }, { slug: "book2", label: "Book 2" },
]};

function renderPage() {
  return render(
    <MemoryRouter><LightboxProvider><ExamIndex /></LightboxProvider></MemoryRouter>);
}

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

test("renders entries alphabetically under letter groups with citations", () => {
  addOrMergeEntry({ term: "Regolith Sweep", definition: "Cleanup pass.",
    citations: [{ slug: "book1", label: "Book 1", page: 6 }], topic: "Demo Cycle" });
  addOrMergeEntry({ term: "Crater Watch", definition: "",
    citations: [{ slug: "book2", label: "Book 2", page: 6 }], topic: "" });
  renderPage();

  const headings = screen.getAllByTestId("letter-heading").map((el) => el.textContent);
  expect(headings).toEqual(["C", "R"]);
  expect(screen.getByText("Regolith Sweep")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Book 1 p\.6/ })).toBeInTheDocument();
  expect(screen.getByText(/2 ENTRIES/)).toBeInTheDocument();
});

test("non-alpha leading terms group under the # heading before letters", () => {
  addOrMergeEntry({ term: "42 Relay Uplink", definition: "Backup comms relay.",
    citations: [{ slug: "book1", label: "Book 1", page: 9 }], topic: "" });
  addOrMergeEntry({ term: "Crater Watch", definition: "",
    citations: [{ slug: "book2", label: "Book 2", page: 6 }], topic: "" });
  renderPage();

  const headings = screen.getAllByTestId("letter-heading").map((el) => el.textContent);
  expect(headings).toEqual(["#", "C"]);
});

test("filter narrows entries instantly across term, definition, and topic", async () => {
  addOrMergeEntry({ term: "Dust Lock", definition: "Seals a module.",
    citations: [{ slug: "book2", label: "Book 2", page: 2 }], topic: "" });
  addOrMergeEntry({ term: "Ops Tempo", definition: "Briefing cadence.",
    citations: [{ slug: "book2", label: "Book 2", page: 4 }], topic: "" });
  renderPage();

  await userEvent.type(screen.getByPlaceholderText(/filter/i), "seals");
  expect(screen.getByText("Dust Lock")).toBeInTheDocument();
  expect(screen.queryByText("Ops Tempo")).not.toBeInTheDocument();
});

test("inline edit saves changes to the store", async () => {
  addOrMergeEntry({ term: "LBIR", definition: "old words",
    citations: [{ slug: "book1", label: "Book 1", page: 1 }], topic: "" });
  renderPage();

  await userEvent.click(screen.getByRole("button", { name: "[EDIT]" }));
  const def = screen.getByLabelText(/edit definition/i);
  await userEvent.clear(def);
  await userEvent.type(def, "Lunar Base Incident Response program.");
  await userEvent.click(screen.getByRole("button", { name: "[SAVE]" }));

  expect(examIndexStore.get().entries[0].definition)
    .toBe("Lunar Base Incident Response program.");
});

test("cancel discards draft edits and reopening shows original values", async () => {
  addOrMergeEntry({ term: "LBIR", definition: "old words",
    citations: [{ slug: "book1", label: "Book 1", page: 1 }], topic: "" });
  renderPage();

  await userEvent.click(screen.getByRole("button", { name: "[EDIT]" }));
  const def = screen.getByLabelText(/edit definition/i);
  await userEvent.clear(def);
  await userEvent.type(def, "junk text");
  expect(examIndexStore.get().entries[0].definition).toBe("old words");

  await userEvent.click(screen.getByRole("button", { name: "[CANCEL]" }));
  expect(examIndexStore.get().entries[0].definition).toBe("old words");

  await userEvent.click(screen.getByRole("button", { name: "[EDIT]" }));
  expect(screen.getByLabelText(/edit definition/i)).toHaveValue("old words");
  expect(examIndexStore.get().entries[0].definition).toBe("old words");
});

test("duplicate terms show a warning marker", () => {
  examIndexStore.set(() => ({
    dismissed: [],
    entries: [
      { id: "a", term: "Ops Tempo", definition: "", topic: "", at: 1,
        citations: [{ slug: "book1", label: "Book 1", page: 2 }] },
      { id: "b", term: "ops tempo", definition: "", topic: "", at: 2,
        citations: [{ slug: "book2", label: "Book 2", page: 4 }] },
    ],
  }));
  renderPage();
  expect(screen.getAllByText(/DUPLICATE/)).toHaveLength(2);
});

test("remove deletes the entry", async () => {
  addOrMergeEntry({ term: "DPC", definition: "",
    citations: [{ slug: "book1", label: "Book 1", page: 5 }], topic: "" });
  renderPage();
  await userEvent.click(screen.getByRole("button", { name: "[REMOVE]" }));
  expect(examIndexStore.get().entries).toHaveLength(0);
});

test("new entry button opens the blank capture dialog", async () => {
  renderPage();
  await userEvent.click(screen.getByRole("button", { name: /new entry/i }));
  expect(screen.getByRole("dialog", { name: /add to index/i })).toBeInTheDocument();
});

test("export buttons and print link are present when entries exist", async () => {
  addOrMergeEntry({ term: "Dust Lock", definition: "",
    citations: [{ slug: "book2", label: "Book 2", page: 2 }], topic: "" });
  renderPage();
  expect(screen.getByText(/1 ENTRY\b/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "EXPORT CSV" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "EXPORT JSON" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "IMPORT JSON" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /print view/i })).toHaveAttribute(
    "href", "/index/print");

  // The seed fetch resolves 404 under the default beforeEach stub, so the
  // "LOAD PACK SAMPLE" button never appears. waitFor on an already-rendered
  // node flushes the seed effect's promise chain deterministically before
  // the negative assertion, without any arbitrary sleep.
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "EXPORT CSV" })).toBeInTheDocument();
  });
  expect(screen.queryByRole("button", { name: "LOAD PACK SAMPLE" })).not.toBeInTheDocument();
});

test("load pack sample appears when the seed endpoint responds and imports on click", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/course")) return { ok: true, json: async () => COURSE };
    if (url.startsWith("/api/content/index-seed")) {
      return { ok: true, json: async () => ({
        version: 1, entries: [{ term: "Crater Watch", definition: "Watch rotation.",
          citations: [{ slug: "book2", label: "Book 2", page: 6 }], topic: "" }],
      }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  }) as any);
  renderPage();
  const btn = await screen.findByRole("button", { name: "LOAD PACK SAMPLE" });
  await userEvent.click(btn);
  expect(examIndexStore.get().entries.map((e) => e.term)).toContain("Crater Watch");
  expect(screen.getByText(/1 ADDED, 0 SKIPPED/)).toBeInTheDocument();
});

function seedFile(name: string): File {
  return new File([JSON.stringify({
    version: 1,
    entries: [{ term: "Crater Watch", definition: "Watch rotation.",
      citations: [{ slug: "book2", label: "Book 2", page: 6 }], topic: "" }],
  })], name, { type: "application/json" });
}

test("importing a JSON file via IMPORT JSON adds entries and shows a notice", async () => {
  renderPage();
  const input = screen.getByLabelText("Import index JSON file");

  await userEvent.upload(input, seedFile("idx.json"));

  expect(await screen.findByText("IMPORTED: 1 ADDED, 0 SKIPPED")).toBeInTheDocument();
  expect(examIndexStore.get().entries.map((e) => e.term)).toContain("Crater Watch");
});

test("importing a file with invalid JSON syntax shows an IMPORT FAILED notice", async () => {
  renderPage();
  const input = screen.getByLabelText("Import index JSON file");
  const badFile = new File(["{not json"], "bad.json", { type: "application/json" });

  await userEvent.upload(input, badFile);

  expect(await screen.findByText(/^IMPORT FAILED:/)).toBeInTheDocument();
  expect(examIndexStore.get().entries).toHaveLength(0);
});

test("importing valid JSON with the wrong shape shows an IMPORT FAILED notice", async () => {
  renderPage();
  const input = screen.getByLabelText("Import index JSON file");
  const wrongShapeFile = new File(["[1,2,3]"], "wrong.json", { type: "application/json" });

  await userEvent.upload(input, wrongShapeFile);

  expect(await screen.findByText(/^IMPORT FAILED:.*entries' array/)).toBeInTheDocument();
  expect(examIndexStore.get().entries).toHaveLength(0);
});

test("re-importing the same file after a store reset re-fires the import", async () => {
  renderPage();
  const input = screen.getByLabelText("Import index JSON file");
  const file = seedFile("idx.json");

  await userEvent.upload(input, file);
  expect(await screen.findByText("IMPORTED: 1 ADDED, 0 SKIPPED")).toBeInTheDocument();
  expect(examIndexStore.get().entries.map((e) => e.term)).toContain("Crater Watch");

  // Clear the store so a second successful import is the only way "Crater
  // Watch" can reappear. The notice text alone is not proof of a re-fire:
  // it would be identical to (and could still be sitting in the DOM from)
  // the first import, so the store check is the real pin on the
  // e.target.value = "" reset in onImportFile that allows re-selecting the
  // same File to fire another change event.
  examIndexStore.set(() => ({ entries: [], dismissed: [] }));
  expect(examIndexStore.get().entries).toHaveLength(0);

  // userEvent.upload with the identical File object re-fired the change
  // event correctly in jsdom (v14 @testing-library/user-event over jsdom's
  // file input): no fireEvent.change fallback was needed.
  await userEvent.upload(input, file);

  await waitFor(() => {
    expect(examIndexStore.get().entries.map((e) => e.term)).toContain("Crater Watch");
  });
  expect(await screen.findByText("IMPORTED: 1 ADDED, 0 SKIPPED")).toBeInTheDocument();
});
