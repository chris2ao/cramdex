import { useState } from "react";
import { ButtonPrimary, ButtonSecondary } from "./ui/Button";
import { Panel } from "./ui/Panel";
import { useCourse } from "../lib/course";
import type { IndexCitation } from "../stores/examIndex";
import { addOrMergeEntry, examIndexStore, findEntryByTerm } from "../stores/examIndex";
import { useStore } from "../stores/useStore";

export type CaptureSeed = {
  term?: string;
  definition?: string;
  citation?: IndexCitation;
};

export function IndexCaptureDialog({ seed, onClose }: { seed: CaptureSeed; onClose: () => void }) {
  const course = useCourse();
  const state = useStore(examIndexStore);
  const [term, setTerm] = useState(seed.term ?? "");
  const [definition, setDefinition] = useState(seed.definition ?? "");
  const [topic, setTopic] = useState("");
  const [slug, setSlug] = useState("");
  const [page, setPage] = useState("");
  const [error, setError] = useState("");

  const books = course?.books ?? [];
  const existing = term.trim() ? findEntryByTerm(state, term) : undefined;

  function save() {
    const trimmed = term.trim();
    if (!trimmed) {
      setError("A term is required.");
      return;
    }
    let citation: IndexCitation;
    if (seed.citation) {
      citation = seed.citation;
    } else {
      const book = books.find((b) => b.slug === slug);
      const pageNum = Number(page);
      if (!book || !Number.isInteger(pageNum) || pageNum < 1) {
        setError("Pick a book and a printed page number for the citation.");
        return;
      }
      citation = { slug: book.slug, label: book.label, page: pageNum };
    }
    addOrMergeEntry({
      term: trimmed, definition: definition.trim(),
      citations: [citation], topic: topic.trim(),
    });
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Add to index"
         className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
         onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}>
      <Panel className="w-full max-w-lg p-5">
        <span className="mono-label mb-3 block text-[10px] text-yl">{"// ADD_TO_INDEX"}</span>

        <label className="mono-label mb-1 block text-[10px] text-faint" htmlFor="idx-term">
          TERM
        </label>
        <input id="idx-term" autoFocus value={term} onChange={(e) => setTerm(e.target.value)}
               className="input-hud mb-1 w-full px-3 py-2 text-sm" />
        {existing && (
          <p className="mono-label mb-1 text-[10px] text-cy">
            IN INDEX ALREADY: SAVING ADDS THIS CITATION TO THE EXISTING ENTRY
          </p>
        )}

        <label className="mono-label mb-1 mt-2 block text-[10px] text-faint" htmlFor="idx-def">
          DEFINITION (YOUR OWN WORDS)
        </label>
        <textarea id="idx-def" rows={3} value={definition}
                  onChange={(e) => setDefinition(e.target.value)}
                  className="input-hud mb-2 w-full px-3 py-2 text-sm" />

        <label className="mono-label mb-1 block text-[10px] text-faint" htmlFor="idx-topic">
          TOPIC (OPTIONAL)
        </label>
        <input id="idx-topic" value={topic} onChange={(e) => setTopic(e.target.value)}
               className="input-hud mb-3 w-full px-3 py-2 text-sm" />

        {seed.citation ? (
          <p className="mono-label mb-3 text-[10px] text-cy">
            CITATION: {seed.citation.label.toUpperCase()} P.{seed.citation.page}
          </p>
        ) : (
          <div className="mb-3 flex items-center gap-2">
            <select aria-label="Citation book" value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="input-hud px-2 py-2 text-sm">
              <option value="">BOOK...</option>
              {books.map((b) => (
                <option key={b.slug} value={b.slug}>{b.label}</option>
              ))}
            </select>
            <input aria-label="Citation printed page" placeholder="PAGE" inputMode="numeric"
                   value={page} onChange={(e) => setPage(e.target.value)}
                   className="input-hud w-24 px-2 py-2 text-sm" />
          </div>
        )}

        {error && <p className="mono-label mb-2 text-[10px] text-rd">{error}</p>}
        <div className="flex justify-end gap-2">
          <ButtonSecondary onClick={onClose}>CANCEL</ButtonSecondary>
          <ButtonPrimary onClick={save}>SAVE TO INDEX</ButtonPrimary>
        </div>
      </Panel>
    </div>
  );
}

export function AddToIndexButton({ slug, label, page, snippet = "", className = "" }: {
  slug: string; label: string; page: number; snippet?: string; className?: string;
}) {
  const [seed, setSeed] = useState<CaptureSeed | null>(null);
  return (
    <>
      <button onClick={() => setSeed({ definition: snippet, citation: { slug, label, page } })}
              className={`mono-label text-[10px] text-faint transition-colors duration-120 hover:text-cy ${className}`}>
        [+INDEX]
      </button>
      {seed && (
        <IndexCaptureDialog seed={seed} onClose={() => setSeed(null)} />
      )}
    </>
  );
}
