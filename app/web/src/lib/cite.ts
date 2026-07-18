import type { CourseBook } from "./course";

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "cite"; label: string; slug: string; page: number; text: string };

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches "<label> p.76", "<label> p. 115", "<label> p.70-71" for any
// configured book label (longest first so labels cannot shadow each other).
export function parseCitations(text: string, books: CourseBook[]): Segment[] {
  if (books.length === 0) return [{ kind: "text", text }];
  const bySpacedLabel = new Map(
    books.map((b) => [b.label.replace(/\s+/g, " "), b]));
  const alternation = [...books]
    .sort((a, b) => b.label.length - a.label.length)
    .map((b) => escapeRe(b.label).replace(/\\?\s+/g, "\\s+"))
    .join("|");
  const citeRe = new RegExp(
    `(${alternation})\\s+p\\.\\s*(\\d+)(?:\\s*[\\u2013-]\\s*\\d+)?`, "g");
  const segments: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(citeRe)) {
    const label = m[1].replace(/\s+/g, " ");
    const book = bySpacedLabel.get(label);
    if (!book) continue;
    if (m.index! > last) segments.push({ kind: "text", text: text.slice(last, m.index) });
    segments.push({ kind: "cite", label: book.label, slug: book.slug,
                    page: parseInt(m[2], 10), text: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}
