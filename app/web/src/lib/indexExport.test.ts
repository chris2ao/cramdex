import type { IndexEntry } from "../stores/examIndex";
import { toCsv, toJson } from "./indexExport";

const ENTRY = (term: string, extra: Partial<IndexEntry> = {}): IndexEntry => ({
  id: `id-${term}`, term, definition: "", topic: "", at: 1,
  citations: [{ slug: "book1", label: "Book 1", page: 3 }],
  ...extra,
});

test("toCsv is alphabetical with quoted, escaped fields and joined citations", () => {
  const csv = toCsv([
    ENTRY("Regolith Sweep", {
      definition: 'Cleanup pass, aka "the sweep"',
      citations: [
        { slug: "book1", label: "Book 1", page: 6 },
        { slug: "book2", label: "Book 2", page: 2 },
      ],
    }),
    ENTRY("Crater Watch", { topic: "Ops Tempo" }),
  ]);
  const lines = csv.trimEnd().split("\n");
  expect(lines[0]).toBe("term,definition,citations,topic");
  expect(lines[1]).toBe('"Crater Watch","","Book 1 p.3","Ops Tempo"');
  expect(lines[2]).toBe(
    '"Regolith Sweep","Cleanup pass, aka ""the sweep""","Book 1 p.6; Book 2 p.2",""');
});

test("toCsv neutralizes spreadsheet formula prefixes", () => {
  const csv = toCsv([
    ENTRY("Airlock Drill", { definition: "-EVA prep first" }),
    ENTRY("Dust Lock", { definition: "=1+1" }),
    ENTRY("Ops Tempo", { definition: "@cmd", topic: "+sum" }),
  ]);
  const lines = csv.trimEnd().split("\n");
  expect(lines[1]).toBe('"Airlock Drill","\'-EVA prep first","Book 1 p.3",""');
  expect(lines[2]).toBe('"Dust Lock","\'=1+1","Book 1 p.3",""');
  expect(lines[3]).toBe('"Ops Tempo","\'@cmd","Book 1 p.3","\'+sum"');
});

test("toJson wraps entries in the version 1 document format", () => {
  const doc = JSON.parse(toJson([ENTRY("Dust Lock")]));
  expect(doc.version).toBe(1);
  expect(doc.entries).toHaveLength(1);
  expect(doc.entries[0].term).toBe("Dust Lock");
});
