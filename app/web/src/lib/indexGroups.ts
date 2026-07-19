import type { IndexEntry } from "../stores/examIndex";
import { normalizeTerm } from "../stores/examIndex";

export type LetterGroup = { letter: string; entries: IndexEntry[] };

/**
 * Alphabetical letter groups for the printed index, Voltaire style:
 * a "#" bucket for terms starting with digits or symbols, then A-Z.
 * Only letters that have entries appear (no empty placeholder sections).
 */
export function groupByLetter(entries: IndexEntry[]): LetterGroup[] {
  const sorted = [...entries].sort((a, b) =>
    normalizeTerm(a.term).localeCompare(normalizeTerm(b.term)));
  const buckets = new Map<string, IndexEntry[]>();
  for (const e of sorted) {
    const first = normalizeTerm(e.term).charAt(0);
    const letter = first >= "a" && first <= "z" ? first.toUpperCase() : "#";
    buckets.set(letter, [...(buckets.get(letter) ?? []), e]);
  }
  const letters = [...buckets.keys()].sort((a, b) =>
    a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b));
  return letters.map((letter) => ({ letter, entries: buckets.get(letter)! }));
}
