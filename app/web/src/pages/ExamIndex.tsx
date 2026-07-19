import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { CitationChip } from "../components/CitationChip";
import { IndexCaptureDialog } from "../components/IndexCapture";
import { IndexSuggestions } from "../components/IndexSuggestions";
import { Panel } from "../components/ui/Panel";
import { ButtonSecondary } from "../components/ui/Button";
import { Eyebrow } from "../components/ui/Text";
import { downloadBlob, downloadText, toCsv, toJson } from "../lib/indexExport";
import { bookColor } from "../lib/bookColor";
import { useCourse } from "../lib/course";
import type { CourseBook } from "../lib/course";
import { groupByLetter } from "../lib/indexGroups";
import { printSettingsStore } from "../stores/printSettings";
import type { IndexEntry } from "../stores/examIndex";
import {
  duplicateTerms, examIndexStore, importEntries, normalizeTerm, removeCitation, removeEntry,
  sortedEntries, updateEntry,
} from "../stores/examIndex";
import { useStore } from "../stores/useStore";

function EntryRow({ entry, books, isDupe }: {
  entry: IndexEntry; books: readonly CourseBook[]; isDupe: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    term: entry.term, definition: entry.definition, topic: entry.topic,
  });

  function saveEdit() {
    if (!draft.term.trim()) return;
    updateEntry(entry.id, {
      term: draft.term.trim(), definition: draft.definition.trim(),
      topic: draft.topic.trim(),
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <Panel className="border-l-2 border-l-cy p-3">
        <label className="mono-label mb-1 block text-[10px] text-faint" htmlFor={`t-${entry.id}`}>
          EDIT TERM
        </label>
        <input id={`t-${entry.id}`} value={draft.term}
               onChange={(e) => setDraft({ ...draft, term: e.target.value })}
               className="input-hud mb-2 w-full px-2 py-1.5 text-sm" />
        <label className="mono-label mb-1 block text-[10px] text-faint" htmlFor={`d-${entry.id}`}>
          EDIT DEFINITION
        </label>
        <textarea id={`d-${entry.id}`} rows={2} value={draft.definition}
                  onChange={(e) => setDraft({ ...draft, definition: e.target.value })}
                  className="input-hud mb-2 w-full px-2 py-1.5 text-sm" />
        <label className="mono-label mb-1 block text-[10px] text-faint" htmlFor={`p-${entry.id}`}>
          EDIT TOPIC
        </label>
        <input id={`p-${entry.id}`} value={draft.topic}
               onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
               className="input-hud mb-2 w-full px-2 py-1.5 text-sm" />
        <div className="flex gap-2">
          <button onClick={saveEdit} className="mono-label text-[10px] text-gn">[SAVE]</button>
          <button onClick={() => {
                    setDraft({ term: entry.term, definition: entry.definition, topic: entry.topic });
                    setEditing(false);
                  }}
                  className="mono-label text-[10px] text-faint">[CANCEL]</button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold">{entry.term}</span>
            {isDupe && (
              <span className="mono-label text-[10px] text-rd">DUPLICATE ⚠</span>
            )}
            {entry.topic && (
              <span className="mono-label text-[10px] text-faint">[{entry.topic}]</span>
            )}
          </div>
          {entry.definition && (
            <p className="mt-1 text-sm font-medium text-muted">{entry.definition}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {entry.citations.map((c) => (
              <span key={`${c.slug}:${c.page}`} className="flex items-center gap-1">
                <span aria-hidden className="inline-block h-2.5 w-2.5"
                      style={{ backgroundColor: bookColor(books, c.slug) }} />
                <CitationChip label={c.label} slug={c.slug} page={c.page}
                              text={`${c.label} p.${c.page}`} />
                {entry.citations.length > 1 && (
                  <button aria-label={`Remove citation ${c.label} p.${c.page}`}
                          onClick={() => removeCitation(entry.id, c.slug, c.page)}
                          className="mono-label text-[10px] text-faint hover:text-rd">
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setEditing(true)}
                  className="mono-label text-[10px] text-faint hover:text-cy">[EDIT]</button>
          <button onClick={() => removeEntry(entry.id)}
                  className="mono-label text-[10px] text-faint hover:text-rd">[REMOVE]</button>
        </div>
      </div>
    </Panel>
  );
}

export function ExamIndex() {
  const state = useStore(examIndexStore);
  const course = useCourse();
  const [filter, setFilter] = useState("");
  const [capturing, setCapturing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [seedDoc, setSeedDoc] = useState<unknown>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    // A missing seed is the normal case for hand-built packs: the button
    // simply stays hidden, so a fetch failure needs no user-facing error.
    fetch("/api/content/index-seed")
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => { if (!cancelled && doc) setSeedDoc(doc); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = importEntries(JSON.parse(String(reader.result)));
        setNotice(`IMPORTED: ${result.added} ADDED, ${result.skipped} SKIPPED`);
      } catch (err) {
        setNotice(`IMPORT FAILED: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  }

  function loadSeed() {
    try {
      const result = importEntries(seedDoc);
      setNotice(`PACK SAMPLE: ${result.added} ADDED, ${result.skipped} SKIPPED`);
    } catch (err) {
      setNotice(`IMPORT FAILED: ${(err as Error).message}`);
    }
  }

  const books = course?.books ?? [];
  const dupes = duplicateTerms(state);
  const q = filter.trim().toLowerCase();

  const groups = useMemo(() => {
    const filtered = sortedEntries(state).filter((e) =>
      !q || [e.term, e.definition, e.topic].some((f) => f.toLowerCase().includes(q)));
    const byLetter = new Map<string, IndexEntry[]>();
    for (const e of filtered) {
      const first = normalizeTerm(e.term).charAt(0);
      const letter = /[a-z]/.test(first) ? first.toUpperCase() : "#";
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), e]);
    }
    return [...byLetter.entries()];
  }, [state, q]);

  return (
    <div>
      <Eyebrow className="mb-2">OPEN_BOOK_PREP</Eyebrow>
      <h1 className="mb-1 text-[30px] font-bold uppercase tracking-wide text-fg">
        Exam Index
      </h1>
      <p className="mono-label mb-6 text-[10px] text-faint">
        YOUR PERSONAL OPEN-BOOK INDEX · {state.entries.length} {state.entries.length === 1 ? "ENTRY" : "ENTRIES"}
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input value={filter} onChange={(e) => setFilter(e.target.value)}
               placeholder="FILTER TERMS..."
               className="input-hud w-64 px-3 py-2 text-sm" />
        <ButtonSecondary onClick={() => setCapturing(true)}>+ NEW ENTRY</ButtonSecondary>
        <ButtonSecondary onClick={() => downloadText(
          "cramdex-index.csv", "text/csv", toCsv(state.entries))}>EXPORT CSV</ButtonSecondary>
        <ButtonSecondary onClick={() => downloadText(
          "cramdex-index.json", "application/json", toJson(state.entries))}>EXPORT JSON</ButtonSecondary>
        <ButtonSecondary onClick={async () => {
          const { Packer } = await import("docx");
          const { buildIndexDoc } = await import("../lib/indexDocx");
          const doc = buildIndexDoc(course?.name ?? "Course",
            groupByLetter(state.entries), course?.books ?? [], printSettingsStore.get());
          downloadBlob("cramdex-index.docx", await Packer.toBlob(doc));
        }}>EXPORT DOCX</ButtonSecondary>
        <ButtonSecondary onClick={() => fileRef.current?.click()}>IMPORT JSON</ButtonSecondary>
        <input ref={fileRef} type="file" accept="application/json,.json"
               className="hidden" aria-label="Import index JSON file" onChange={onImportFile} />
        {seedDoc != null && (
          <ButtonSecondary onClick={loadSeed}>LOAD PACK SAMPLE</ButtonSecondary>
        )}
        <Link to="/index/print" className="mono-label text-[10px] text-cy">PRINT VIEW ▸</Link>
      </div>

      {notice && <p className="mono-label mb-4 text-[10px] text-gn">{notice}</p>}

      {state.entries.length === 0 ? (
        <Panel className="p-6">
          <span className="mono-label text-xs text-faint">
            EMPTY INDEX // CAPTURE TERMS FROM SEARCH, THE READER, OR THE PAGE VIEWER
          </span>
        </Panel>
      ) : (
        <div className="space-y-5">
          {groups.map(([letter, entries]) => (
            <div key={letter}>
              <span data-testid="letter-heading" className="mono-label mb-2 block text-xs text-cy">
                {letter}
              </span>
              <ul className="space-y-2">
                {entries.map((e) => (
                  <li key={e.id}>
                    <EntryRow entry={e} books={books}
                              isDupe={dupes.has(normalizeTerm(e.term))} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <IndexSuggestions />

      {capturing && (
        <IndexCaptureDialog seed={{}} onClose={() => setCapturing(false)} />
      )}
    </div>
  );
}
