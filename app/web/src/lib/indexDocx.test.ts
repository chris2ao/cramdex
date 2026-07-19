import { Packer } from "docx";
// jszip is a transitive dependency of docx (docx's own OOXML packer uses it
// internally), so it resolves from node_modules without a package.json
// entry. It is imported here only to unzip the .docx we already produce
// with Packer.toBuffer, so we can assert on the OOXML markup docx wrote.
import JSZip from "jszip";
import type { IndexEntry } from "../stores/examIndex";
import { groupByLetter } from "./indexGroups";
import { buildIndexDoc, docSections } from "./indexDocx";

const BOOKS = [{ slug: "book1", label: "Book 1" }, { slug: "book2", label: "Book 2" }];
const ENTRY = (term: string, overrides: Partial<IndexEntry> = {}): IndexEntry => ({
  id: `id-${term}`, term, definition: "A definition.", topic: "Ops Tempo", at: 1,
  citations: [{ slug: "book1", label: "Book 1", page: 3 }],
  ...overrides,
});
const OPTS = { letterBreaks: true, coverSheet: true, fontSize: "m", columns: 2 } as const;

// docx has no public API for inspecting the runs/paragraphs it built, so the
// tests below pack the document and read the raw OOXML back out of the
// .docx zip (word/document.xml is the section body, word/footerN.xml holds
// the footer). Assertions use proximity-tolerant regexes ("marker A
// followed within N chars by marker B") rather than exact adjacent-tag
// matches, because the precise attribute/tag order docx emits inside a
// <w:rPr> (e.g. whether <w:bCs/> trails <w:b/>) is an internal
// serialization detail that could shift across docx versions; the stable,
// spec-relevant fact is that the formatting tag and the target text co-occur
// in the same run.
async function packToZip(doc: Parameters<typeof Packer.toBuffer>[0]) {
  const buf = await Packer.toBuffer(doc);
  return JSZip.loadAsync(buf);
}

async function documentXml(zip: JSZip) {
  return zip.file("word/document.xml")!.async("string");
}

// The footer part is named footer1.xml in practice, but that numbering is
// an implementation detail of docx's relationship IDs; resolve it via the
// document relationships instead of hardcoding the filename.
async function footerXml(zip: JSZip) {
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const match = rels.match(/Target="([^"]*footer[^"]*)"/);
  if (!match) throw new Error("no footer relationship found in document.xml.rels");
  return zip.file(`word/${match[1]}`)!.async("string");
}

test("buildIndexDoc packs to a non-trivial docx buffer", async () => {
  const doc = buildIndexDoc("MOON-101", groupByLetter([ENTRY("Demo Cycle"), ENTRY("Regolith Sweep")]), BOOKS, OPTS);
  const buf = await Packer.toBuffer(doc);
  expect(buf.byteLength).toBeGreaterThan(1000);
});

test("docSections omits the cover section when coverSheet is off", () => {
  const sections = docSections(
    "MOON-101", groupByLetter([ENTRY("Demo Cycle")]), BOOKS, { ...OPTS, coverSheet: false });
  expect(sections.length).toBe(1);
});

test("docSections includes the cover section when coverSheet is on", () => {
  const sections = docSections(
    "MOON-101", groupByLetter([ENTRY("Demo Cycle")]), BOOKS, { ...OPTS, coverSheet: true });
  expect(sections.length).toBe(2);
});

test("the term is emitted as a bold run", async () => {
  const doc = buildIndexDoc("MOON-101", groupByLetter([ENTRY("Demo Cycle")]), BOOKS, OPTS);
  const xml = await documentXml(await packToZip(doc));
  expect(xml).toMatch(/<w:b\/>[\s\S]{0,80}<w:t[^>]*>Demo Cycle<\/w:t>/);
});

test("citations are italic and colored per book", async () => {
  const entry: IndexEntry = {
    id: "id-crater-watch", term: "Crater Watch", definition: "Def.", topic: "", at: 1,
    citations: [
      { slug: "book1", label: "Book 1", page: 3 },
      { slug: "book2", label: "Book 2", page: 9 },
    ],
  };
  const doc = buildIndexDoc("MOON-101", groupByLetter([entry]), BOOKS, OPTS);
  const xml = await documentXml(await packToZip(doc));
  // book1's palette color is #e63946, book2's is #1d7fd6 (bookColor.ts);
  // docx lowercases the hex it writes into w:val.
  expect(xml).toMatch(/<w:i\/>[\s\S]{0,80}w:val="e63946"[\s\S]{0,80}<w:t[^>]*>[^<]*Book 1 p\.3<\/w:t>/);
  expect(xml).toMatch(/<w:i\/>[\s\S]{0,80}w:val="1d7fd6"[\s\S]{0,80}<w:t[^>]*>[^<]*Book 2 p\.9<\/w:t>/);
});

test("letter headings get pageBreakBefore for every group after the first when letterBreaks is on", async () => {
  const doc = buildIndexDoc(
    "MOON-101", groupByLetter([ENTRY("Demo Cycle"), ENTRY("Regolith Sweep")]), BOOKS,
    { ...OPTS, letterBreaks: true });
  const xml = await documentXml(await packToZip(doc));
  // Two letter groups (D, R): the first heading must not carry a page
  // break, the second must, so exactly one occurrence is expected.
  const count = (xml.match(/<w:pageBreakBefore\/>/g) ?? []).length;
  expect(count).toBe(1);
});

test("letter headings carry no pageBreakBefore when letterBreaks is off", async () => {
  const doc = buildIndexDoc(
    "MOON-101", groupByLetter([ENTRY("Demo Cycle"), ENTRY("Regolith Sweep")]), BOOKS,
    { ...OPTS, letterBreaks: false });
  const xml = await documentXml(await packToZip(doc));
  expect(xml).not.toMatch(/pageBreakBefore/);
});

test("the body section is configured with the requested column count", async () => {
  // OPTS defaults to columns: 2, so overriding to 1 (the only other valid
  // value; PrintSettingsState.columns is 1 | 2) still proves the requested
  // count flows through rather than a hardcoded default.
  const doc = buildIndexDoc("MOON-101", groupByLetter([ENTRY("Demo Cycle")]), BOOKS, { ...OPTS, columns: 1 });
  const xml = await documentXml(await packToZip(doc));
  expect(xml).toMatch(/<w:cols\b[^>]*w:num="1"/);
});

test("the footer centers a PAGE number field", async () => {
  const doc = buildIndexDoc("MOON-101", groupByLetter([ENTRY("Demo Cycle")]), BOOKS, OPTS);
  const xml = await footerXml(await packToZip(doc));
  expect(xml).toMatch(/<w:jc w:val="center"\/>/);
  expect(xml).toContain("PAGE");
});

test("an entry with a definition and topic renders the colon and bracket runs", async () => {
  const entry = ENTRY("Dust Lock", { definition: "A definition.", topic: "Ops Tempo" });
  const doc = buildIndexDoc("MOON-101", groupByLetter([entry]), BOOKS, { ...OPTS, coverSheet: false });
  const xml = await documentXml(await packToZip(doc));
  expect(xml).toContain(": A definition.");
  expect(xml).toContain("[Ops Tempo]");
});

test("an entry with an empty definition and topic emits no colon or bracket run", async () => {
  const entry = ENTRY("Dust Lock", { definition: "", topic: "" });
  const doc = buildIndexDoc("MOON-101", groupByLetter([entry]), BOOKS, { ...OPTS, coverSheet: false });
  const xml = await documentXml(await packToZip(doc));
  // This entry is the only one in the document, so ": " and "[" cannot
  // leak in from some other entry's definition/topic runs.
  expect(xml).not.toContain(": ");
  expect(xml).not.toContain("[");
});

test("an empty index (no letter groups) still packs", async () => {
  const doc = buildIndexDoc("MOON-101", groupByLetter([]), BOOKS, OPTS);
  const buf = await Packer.toBuffer(doc);
  expect(buf.byteLength).toBeGreaterThan(0);
});
