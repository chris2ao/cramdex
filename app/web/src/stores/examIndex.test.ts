import "./testLocalStorage";
import {
  addOrMergeEntry, dismissSuggestion, duplicateTerms, examIndexStore,
  findEntryByTerm, importEntries, normalizeTerm, removeCitation, removeEntry,
  sortedEntries, updateEntry,
} from "./examIndex";

const CITE1 = { slug: "book1", label: "Book 1", page: 3 };
const CITE2 = { slug: "book2", label: "Book 2", page: 6 };

beforeEach(() => {
  window.localStorage.clear();
  examIndexStore.set(() => ({ entries: [], dismissed: [] }));
});

test("addOrMergeEntry creates an entry with generated id and timestamp", () => {
  const result = addOrMergeEntry({
    term: "Demo Cycle", definition: "Six-phase lifecycle.", citations: [CITE1], topic: "Demo Cycle",
  });
  const state = examIndexStore.get();
  expect(result).toBe("added");
  expect(state.entries).toHaveLength(1);
  expect(state.entries[0].id).toBeTruthy();
  expect(state.entries[0].at).toBeGreaterThan(0);
  expect(state.entries[0].term).toBe("Demo Cycle");
});

test("addOrMergeEntry dedupes duplicate citations within the incoming array on the added path", () => {
  addOrMergeEntry({
    term: "Regolith Sweep", definition: "", citations: [CITE1, CITE1], topic: "",
  });
  expect(examIndexStore.get().entries[0].citations).toEqual([CITE1]);
});

test("addOrMergeEntry trims the term on the added path", () => {
  addOrMergeEntry({ term: "  Dust Lock ", definition: "", citations: [CITE1], topic: "" });
  expect(examIndexStore.get().entries[0].term).toBe("Dust Lock");
});

test("addOrMergeEntry merges citations into an existing entry, case-insensitive", () => {
  addOrMergeEntry({ term: "Dust Lock", definition: "Seals a module.", citations: [CITE1], topic: "" });
  const result = addOrMergeEntry({ term: "  dust lock ", definition: "ignored", citations: [CITE2, CITE1], topic: "Ops Tempo" });
  const state = examIndexStore.get();
  expect(result).toBe("merged");
  expect(state.entries).toHaveLength(1);
  expect(state.entries[0].citations).toEqual([CITE1, CITE2]);
  expect(state.entries[0].definition).toBe("Seals a module.");
  expect(state.entries[0].topic).toBe("Ops Tempo");
});

test("merge fills an empty definition but never overwrites one", () => {
  addOrMergeEntry({ term: "Crater Watch", definition: "", citations: [CITE1], topic: "" });
  addOrMergeEntry({ term: "Crater Watch", definition: "Standing monitoring rotation.", citations: [CITE2], topic: "" });
  expect(examIndexStore.get().entries[0].definition).toBe("Standing monitoring rotation.");
});

test("updateEntry patches term, definition, and topic by id", () => {
  addOrMergeEntry({ term: "LBIR", definition: "old", citations: [CITE1], topic: "" });
  const id = examIndexStore.get().entries[0].id;
  updateEntry(id, { definition: "Lunar Base Incident Response." });
  expect(examIndexStore.get().entries[0].definition).toBe("Lunar Base Incident Response.");
});

test("removeEntry deletes by id; removeCitation keeps at least one citation", () => {
  addOrMergeEntry({ term: "DPC", definition: "", citations: [CITE1], topic: "" });
  const id = examIndexStore.get().entries[0].id;
  removeCitation(id, CITE1.slug, CITE1.page);
  expect(examIndexStore.get().entries[0].citations).toHaveLength(1);
  addOrMergeEntry({ term: "DPC", definition: "", citations: [CITE2], topic: "" });
  removeCitation(id, CITE1.slug, CITE1.page);
  expect(examIndexStore.get().entries[0].citations).toEqual([CITE2]);
  removeEntry(id);
  expect(examIndexStore.get().entries).toHaveLength(0);
});

test("duplicateTerms flags normalized collisions created by edits", () => {
  addOrMergeEntry({ term: "Ops Tempo", definition: "", citations: [CITE1], topic: "" });
  addOrMergeEntry({ term: "Regolith Sweep", definition: "", citations: [CITE2], topic: "" });
  expect(duplicateTerms(examIndexStore.get()).size).toBe(0);
  const second = examIndexStore.get().entries.find((e) => e.term === "Regolith Sweep")!;
  updateEntry(second.id, { term: "ops tempo" });
  expect(duplicateTerms(examIndexStore.get())).toEqual(new Set(["ops tempo"]));
});

test("sortedEntries is alphabetical by normalized term", () => {
  addOrMergeEntry({ term: "regolith sweep", definition: "", citations: [CITE1], topic: "" });
  addOrMergeEntry({ term: "Crater Watch", definition: "", citations: [CITE2], topic: "" });
  expect(sortedEntries(examIndexStore.get()).map((e) => e.term))
    .toEqual(["Crater Watch", "regolith sweep"]);
});

test("importEntries adds valid entries, skips existing terms and invalid rows", () => {
  addOrMergeEntry({ term: "Demo Cycle", definition: "", citations: [CITE1], topic: "" });
  const result = importEntries({
    version: 1,
    entries: [
      { term: "demo cycle", definition: "dupe", citations: [CITE2], topic: "" },
      { term: "Meteor Drill Scenario", definition: "Tabletop exercise.", citations: [CITE2], topic: "" },
      { term: "", definition: "invalid: empty term", citations: [CITE1], topic: "" },
      { term: "No citations", definition: "invalid", citations: [], topic: "" },
    ],
  });
  expect(result).toEqual({ added: 1, skipped: 3 });
  expect(findEntryByTerm(examIndexStore.get(), "Meteor Drill Scenario")).toBeTruthy();
});

test("importEntries dedupes colliding terms within a single import batch", () => {
  const result = importEntries({
    version: 1,
    entries: [
      { term: "Ops Tempo", definition: "", citations: [CITE1], topic: "" },
      { term: "ops tempo", definition: "dupe", citations: [CITE2], topic: "" },
    ],
  });
  expect(result).toEqual({ added: 1, skipped: 1 });
});

test("importEntries dedupes duplicate citations within a single imported entry", () => {
  const result = importEntries({
    version: 1,
    entries: [
      { term: "Airlock Cycle Log", definition: "", citations: [CITE1, CITE1], topic: "" },
    ],
  });
  expect(result).toEqual({ added: 1, skipped: 0 });
  expect(examIndexStore.get().entries[0].citations).toEqual([CITE1]);
});

test("importEntries skips an entry with a non-integer or a below-1 citation page", () => {
  const result = importEntries({
    version: 1,
    entries: [
      { term: "Comm Relay Log", definition: "",
        citations: [{ slug: "book1", label: "Book 1", page: 3.5 }], topic: "" },
      { term: "Suit Seal Log", definition: "",
        citations: [{ slug: "book1", label: "Book 1", page: 0 }], topic: "" },
    ],
  });
  expect(result).toEqual({ added: 0, skipped: 2 });
});

test("importEntries throws a clear error on a non-document", () => {
  expect(() => importEntries([1, 2, 3])).toThrow(/entries/);
});

test("dismissSuggestion records a key once", () => {
  dismissSuggestion("book1:3:demo cycle");
  dismissSuggestion("book1:3:demo cycle");
  expect(examIndexStore.get().dismissed).toEqual(["book1:3:demo cycle"]);
});

test("state persists to localStorage under cramdex.examIndex", () => {
  addOrMergeEntry({ term: "Dust Lock", definition: "", citations: [CITE1], topic: "" });
  expect(window.localStorage.getItem("cramdex.examIndex")).toContain("Dust Lock");
  expect(normalizeTerm("  Dust Lock ")).toBe("dust lock");
});

test("a corrupt stored value falls back to initial state; a valid one round-trips", async () => {
  window.localStorage.setItem("cramdex.examIndex", JSON.stringify({ items: [] }));
  vi.resetModules();
  const corrupt = await import("./examIndex");
  expect(corrupt.examIndexStore.get()).toEqual({ entries: [], dismissed: [] });

  const validState = {
    entries: [
      { id: "id-1", term: "Dust Lock", definition: "", citations: [CITE1], topic: "", at: 1 },
    ],
    dismissed: [],
  };
  window.localStorage.setItem("cramdex.examIndex", JSON.stringify(validState));
  vi.resetModules();
  const valid = await import("./examIndex");
  expect(valid.examIndexStore.get()).toEqual(validState);
});
