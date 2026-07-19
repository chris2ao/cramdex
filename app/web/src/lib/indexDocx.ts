import {
  AlignmentType, Document, Footer, HeadingLevel, PageNumber, Paragraph, TextRun,
} from "docx";
import type { CourseBook } from "./course";
import { bookColor } from "./bookColor";
import type { LetterGroup } from "./indexGroups";
import type { IndexEntry } from "../stores/examIndex";
import type { PrintSettingsState } from "../stores/printSettings";

function entryParagraph(e: IndexEntry, books: readonly CourseBook[]): Paragraph {
  const runs = [new TextRun({ text: e.term, bold: true })];
  if (e.definition) runs.push(new TextRun({ text: `: ${e.definition}` }));
  e.citations.forEach((c, i) => runs.push(new TextRun({
    text: `${i > 0 ? "; " : " "}${c.label} p.${c.page}`,
    italics: true,
    color: bookColor(books, c.slug).replace("#", ""),
  })));
  if (e.topic) runs.push(new TextRun({ text: ` [${e.topic}]`, color: "666666" }));
  return new Paragraph({ children: runs, spacing: { after: 60 } });
}

/** The sections array for new Document(); exported for testing. */
export function docSections(
  courseName: string, groups: LetterGroup[], books: readonly CourseBook[],
  opts: PrintSettingsState,
) {
  const body = groups.flatMap((g, gi) => [
    new Paragraph({
      text: g.letter, heading: HeadingLevel.HEADING_1,
      pageBreakBefore: opts.letterBreaks && gi > 0,
    }),
    ...g.entries.map((e) => entryParagraph(e, books)),
  ]);
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT] })],
    })],
  });
  const main = {
    properties: { column: { count: opts.columns, space: 360 } },
    footers: { default: footer },
    children: body,
  };
  if (!opts.coverSheet) return [main];
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  const cover = {
    children: [
      new Paragraph({ text: `${courseName} exam index`, heading: HeadingLevel.TITLE }),
      new Paragraph({ text: `${total} ${total === 1 ? "entry" : "entries"}` }),
      ...books.map((b) => new Paragraph({
        children: [new TextRun({ text: `■ ${b.label}`, color: bookColor(books, b.slug).replace("#", "") })],
      })),
    ],
  };
  return [cover, main];
}

export function buildIndexDoc(
  courseName: string, groups: LetterGroup[], books: readonly CourseBook[],
  opts: PrintSettingsState,
): Document {
  return new Document({ sections: docSections(courseName, groups, books, opts) });
}
