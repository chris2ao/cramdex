import { createStore } from "./store";
import type { Store } from "./store";

export type IndexCitation = { slug: string; label: string; page: number };

export type IndexEntry = {
  id: string;
  term: string;
  definition: string;
  citations: IndexCitation[];
  topic: string;
  at: number;
};

export type ExamIndexState = { entries: IndexEntry[]; dismissed: string[] };

export type IndexEntryInput = {
  term: string;
  definition: string;
  citations: IndexCitation[];
  topic: string;
};

const INITIAL: ExamIndexState = { entries: [], dismissed: [] };

function isCitation(v: unknown): v is IndexCitation {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Partial<IndexCitation>;
  return (
    typeof c.slug === "string" && typeof c.label === "string" &&
    typeof c.page === "number" && Number.isInteger(c.page) && c.page >= 1
  );
}

function isEntry(v: unknown): v is IndexEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Partial<IndexEntry>;
  return (
    typeof e.id === "string" &&
    typeof e.term === "string" &&
    typeof e.definition === "string" &&
    Array.isArray(e.citations) && e.citations.length > 0 && e.citations.every(isCitation) &&
    typeof e.topic === "string" &&
    typeof e.at === "number"
  );
}

function isExamIndexState(v: unknown): v is ExamIndexState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<ExamIndexState>;
  return (
    Array.isArray(s.entries) && s.entries.every(isEntry) &&
    Array.isArray(s.dismissed) && s.dismissed.every((d) => typeof d === "string")
  );
}

export const examIndexStore: Store<ExamIndexState> = createStore(
  "cramdex.examIndex", isExamIndexState, INITIAL);

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase();
}

export function findEntryByTerm(state: ExamIndexState, term: string): IndexEntry | undefined {
  const key = normalizeTerm(term);
  return state.entries.find((e) => normalizeTerm(e.term) === key);
}

function mergeCitations(existing: IndexCitation[], incoming: IndexCitation[]): IndexCitation[] {
  const seen = new Set(existing.map((c) => `${c.slug}:${c.page}`));
  const added = incoming.filter((c) => {
    const key = `${c.slug}:${c.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...existing, ...added];
}

/**
 * Adds a new entry, or merges into the existing entry with the same
 * normalized term: citations are deduped by slug+page, and an empty
 * definition or topic on the existing entry is filled from the input.
 */
export function addOrMergeEntry(input: IndexEntryInput): "added" | "merged" {
  const existing = findEntryByTerm(examIndexStore.get(), input.term);
  if (existing) {
    examIndexStore.set((state) => ({
      ...state,
      entries: state.entries.map((e) =>
        e.id === existing.id
          ? {
              ...e,
              citations: mergeCitations(e.citations, input.citations),
              definition: e.definition || input.definition,
              topic: e.topic || input.topic,
            }
          : e),
    }));
    return "merged";
  }
  const entry: IndexEntry = {
    id: newId(),
    at: Date.now(),
    ...input,
    term: input.term.trim(),
    citations: mergeCitations([], input.citations),
  };
  examIndexStore.set((state) => ({ ...state, entries: [entry, ...state.entries] }));
  return "added";
}

export function updateEntry(
  id: string, patch: Partial<Pick<IndexEntry, "term" | "definition" | "topic">>): void {
  examIndexStore.set((state) => ({
    ...state,
    entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  }));
}

export function removeEntry(id: string): void {
  examIndexStore.set((state) => ({
    ...state,
    entries: state.entries.filter((e) => e.id !== id),
  }));
}

/** Removes one citation; a lone citation is never removed (entries keep at least one). */
export function removeCitation(id: string, slug: string, page: number): void {
  examIndexStore.set((state) => ({
    ...state,
    entries: state.entries.map((e) => {
      if (e.id !== id || e.citations.length <= 1) return e;
      return { ...e, citations: e.citations.filter((c) => !(c.slug === slug && c.page === page)) };
    }),
  }));
}

export function dismissSuggestion(key: string): void {
  examIndexStore.set((state) =>
    state.dismissed.includes(key) ? state : { ...state, dismissed: [...state.dismissed, key] });
}

/** Normalized terms that appear on more than one entry (possible after inline edits). */
export function duplicateTerms(state: ExamIndexState): Set<string> {
  const counts = new Map<string, number>();
  for (const e of state.entries) {
    const key = normalizeTerm(e.term);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

export function sortedEntries(state: ExamIndexState): IndexEntry[] {
  return [...state.entries].sort((a, b) =>
    normalizeTerm(a.term).localeCompare(normalizeTerm(b.term)));
}

/** One entry in the interchange format: id and at are optional and generated on import. */
type SeedEntry = IndexEntryInput & { id?: string; at?: number };

function isSeedEntry(v: unknown): v is SeedEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Partial<IndexEntry>;
  return (
    typeof e.term === "string" && e.term.trim() !== "" &&
    typeof e.definition === "string" &&
    Array.isArray(e.citations) && e.citations.length > 0 && e.citations.every(isCitation) &&
    typeof e.topic === "string" &&
    (e.id === undefined || typeof e.id === "string") &&
    (e.at === undefined || typeof e.at === "number")
  );
}

export type ImportResult = { added: number; skipped: number };

/**
 * Imports entries from a parsed index document ({version: 1, entries: [...]}).
 * Entries whose normalized term already exists, and entries that fail
 * validation, are skipped. Throws on a value that is not an index document
 * so callers can show a clear error.
 */
export function importEntries(doc: unknown): ImportResult {
  if (typeof doc !== "object" || doc === null ||
      !Array.isArray((doc as { entries?: unknown }).entries)) {
    throw new Error("Not a cramdex index document: expected an object with an 'entries' array.");
  }
  const incoming = (doc as { entries: unknown[] }).entries;
  let added = 0;
  let skipped = 0;
  examIndexStore.set((state) => {
    const seen = new Set(state.entries.map((e) => normalizeTerm(e.term)));
    const fresh: IndexEntry[] = [];
    for (const raw of incoming) {
      if (!isSeedEntry(raw) || seen.has(normalizeTerm(raw.term))) {
        skipped += 1;
        continue;
      }
      seen.add(normalizeTerm(raw.term));
      fresh.push({
        id: raw.id ?? newId(),
        at: raw.at ?? Date.now(),
        term: raw.term.trim(),
        definition: raw.definition,
        citations: mergeCitations([], raw.citations),
        topic: raw.topic,
      });
      added += 1;
    }
    return { ...state, entries: [...fresh, ...state.entries] };
  });
  return { added, skipped };
}
