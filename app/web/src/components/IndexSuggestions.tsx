import { useEffect, useState } from "react";
import { IndexCaptureDialog } from "./IndexCapture";
import { Panel } from "./ui/Panel";
import { Pill } from "./ui/Pill";
import { ButtonSecondary } from "./ui/Button";
import { useCourse } from "../lib/course";
import { useLlmGuard } from "../lib/llm";
import { dismissSuggestion, examIndexStore, normalizeTerm } from "../stores/examIndex";
import { useStore } from "../stores/useStore";

type Suggestion = {
  term: string; slug: string; label: string;
  printed_page: number; kind: string; hint: string;
};

const SHOW_LIMIT = 30;

function suggestionKey(s: Suggestion): string {
  return `${s.slug}:${s.printed_page}:${normalizeTerm(s.term)}`;
}

function SuggestionRow({ s, onReview, onDismiss }: {
  s: Suggestion; onReview: (s: Suggestion) => void; onDismiss: (key: string) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-edge py-1.5 last:border-b-0">
      <div className="min-w-0">
        <span className="text-sm font-semibold">{s.term}</span>{" "}
        <span className="mono-label text-[10px] text-faint">
          {s.kind.toUpperCase()} · {s.label} P.{s.printed_page}
        </span>
        {s.hint && <p className="text-xs font-medium text-muted">{s.hint}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button onClick={() => onReview(s)}
                className="mono-label text-[10px] text-cy">[REVIEW ▸]</button>
        <button onClick={() => onDismiss(suggestionKey(s))}
                className="mono-label text-[10px] text-faint hover:text-rd">[DISMISS]</button>
      </div>
    </li>
  );
}

export function IndexSuggestions() {
  const course = useCourse();
  const state = useStore(examIndexStore);
  const { llm, llmUnconfigured } = useLlmGuard();
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [aiItems, setAiItems] = useState<Suggestion[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [bookFilter, setBookFilter] = useState("");
  const [reviewing, setReviewing] = useState<Suggestion | null>(null);
  const [aiBook, setAiBook] = useState("");
  const [aiFirst, setAiFirst] = useState("");
  const [aiLast, setAiLast] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const books = course?.books ?? [];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/index/suggest")
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (res.ok) setItems(body.items);
        else setNotice(body.detail ?? res.statusText);
      })
      .catch((e) => { if (!cancelled) setNotice((e as Error).message); });
    return () => { cancelled = true; };
  }, []);

  const indexed = new Set(state.entries.map((e) => normalizeTerm(e.term)));
  const visible = (candidates: Suggestion[]) =>
    candidates.filter((s) =>
      !indexed.has(normalizeTerm(s.term)) &&
      !state.dismissed.includes(suggestionKey(s)) &&
      (!bookFilter || s.slug === bookFilter));

  const tsv = visible(items ?? []);
  const ai = visible(aiItems);

  async function runAi() {
    if (aiBusy || llmUnconfigured) return;
    const first = Number(aiFirst);
    const last = Number(aiLast);
    if (!aiBook || !Number.isInteger(first) || first < 1 ||
        !Number.isInteger(last) || last < 1) {
      setError("Pick a book and a printed page range for AI suggestions.");
      return;
    }
    setAiBusy(true);
    setError("");
    try {
      const res = await fetch("/api/index/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book: aiBook, first_page: first, last_page: last }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? res.statusText);
      setAiItems(body.items.map((i: {
        term: string; definition: string; printed_page: number;
        slug: string; label: string;
      }) => ({
        term: i.term, slug: i.slug, label: i.label,
        printed_page: i.printed_page, kind: "ai", hint: i.definition,
      })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <span className="mono-label mb-3 block text-xs text-yl">{"// SUGGESTIONS"}</span>
      <Panel className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Pill active={bookFilter === ""} onClick={() => setBookFilter("")}>ALL</Pill>
          {books.map((b) => (
            <Pill key={b.slug} active={bookFilter === b.slug}
                  onClick={() => setBookFilter(b.slug)}>{b.label}</Pill>
          ))}
        </div>

        {notice && <p className="mono-label mb-2 text-[10px] text-faint">{notice}</p>}
        {items !== null && tsv.length === 0 && !notice && (
          <p className="mono-label mb-2 text-[10px] text-faint">
            NO NEW SUGGESTIONS FOR THIS FILTER
          </p>
        )}
        <ul>
          {tsv.slice(0, SHOW_LIMIT).map((s) => (
            <SuggestionRow key={suggestionKey(s)} s={s}
                            onReview={setReviewing} onDismiss={dismissSuggestion} />
          ))}
        </ul>
        {tsv.length > SHOW_LIMIT && (
          <p className="mono-label mt-2 text-[10px] text-faint">
            SHOWING {SHOW_LIMIT} OF {tsv.length}: ADD OR DISMISS TO SEE MORE
          </p>
        )}

        <div className="mt-4 border-t border-edge pt-3">
          <span className="mono-label mb-2 block text-[10px] text-yl">AI ASSIST</span>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="AI book" value={aiBook}
                    onChange={(e) => setAiBook(e.target.value)}
                    className="input-hud px-2 py-1.5 text-sm">
              <option value="">BOOK...</option>
              {books.map((b) => (
                <option key={b.slug} value={b.slug}>{b.label}</option>
              ))}
            </select>
            <input aria-label="First page" placeholder="FROM" inputMode="numeric"
                   value={aiFirst} onChange={(e) => setAiFirst(e.target.value)}
                   className="input-hud w-20 px-2 py-1.5 text-sm" />
            <input aria-label="Last page" placeholder="TO" inputMode="numeric"
                   value={aiLast} onChange={(e) => setAiLast(e.target.value)}
                   className="input-hud w-20 px-2 py-1.5 text-sm" />
            <ButtonSecondary onClick={runAi} disabled={aiBusy || llmUnconfigured}>
              {aiBusy ? "THINKING..." : "AI SUGGEST ▸"}
            </ButtonSecondary>
          </div>
          {llm && !llm.configured && (
            <p className="mono-label mt-2 text-[10px] text-rd">
              AI SUGGESTIONS NEED AN LLM PROVIDER. ACTIVE: {llm.display_name}. {llm.detail}
            </p>
          )}
          {error && <p className="mono-label mt-2 text-[10px] text-rd">{error}</p>}
          {ai.length > 0 && (
            <>
              <ul className="mt-2">
                {ai.slice(0, SHOW_LIMIT).map((s) => (
                  <SuggestionRow key={suggestionKey(s)} s={s}
                                  onReview={setReviewing} onDismiss={dismissSuggestion} />
                ))}
              </ul>
              {ai.length > SHOW_LIMIT && (
                <p className="mono-label mt-2 text-[10px] text-faint">
                  SHOWING {SHOW_LIMIT} OF {ai.length}: ADD OR DISMISS TO SEE MORE
                </p>
              )}
            </>
          )}
        </div>
      </Panel>

      {reviewing && (
        <IndexCaptureDialog
          seed={{
            term: reviewing.term, definition: reviewing.hint,
            citation: { slug: reviewing.slug, label: reviewing.label,
                        page: reviewing.printed_page },
          }}
          onClose={() => setReviewing(null)} />
      )}
    </div>
  );
}
