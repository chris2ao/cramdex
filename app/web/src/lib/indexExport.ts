import type { IndexEntry } from "../stores/examIndex";
import { normalizeTerm } from "../stores/examIndex";

function csvField(value: string): string {
  // Neutralize spreadsheet formula injection: a leading =, +, -, @, tab,
  // or CR would otherwise execute when the CSV is opened in a spreadsheet.
  // Accepted tradeoff: a legitimate value starting with one of these (most
  // plausibly "-") gains a visible leading apostrophe, the standard
  // spreadsheet convention for literal text.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsv(entries: IndexEntry[]): string {
  const header = "term,definition,citations,topic";
  const rows = [...entries]
    .sort((a, b) => normalizeTerm(a.term).localeCompare(normalizeTerm(b.term)))
    .map((e) => [
      csvField(e.term),
      csvField(e.definition),
      csvField(e.citations.map((c) => `${c.label} p.${c.page}`).join("; ")),
      csvField(e.topic),
    ].join(","));
  return [header, ...rows].join("\n") + "\n";
}

export function toJson(entries: IndexEntry[]): string {
  return JSON.stringify({ version: 1, entries }, null, 2) + "\n";
}

/** Triggers a browser download of `text` as `filename`. */
export function downloadText(filename: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
